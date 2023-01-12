import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';

import { ChangelogEntry, UNPUBLISHED_VERSION_NAME } from '../../Changelogs';
import { EXPO_DIR } from '../../Constants';
import { link } from '../../Formatter';
import Git from '../../Git';
import { dispatchWorkflowEventAsync, getClosedIssuesAsync } from '../../GitHubActions';
import logger from '../../Logger';
import { Package } from '../../Packages';
import { Task } from '../../TasksRunner';
import { CommentatorPayload } from '../../commands/CommentatorCommand';
import { CommandOptions, Parcel, TaskArgs } from '../types';
import { selectPackagesToPublish } from './selectPackagesToPublish';

type CommentRowObject = {
  pkg: Package;
  version: string;
  pullRequests: number[];
};

export const commentOnIssuesTask = new Task<TaskArgs>(
  {
    name: 'commentOnIssuesTask',
    dependsOn: [selectPackagesToPublish],
    backupable: true,
  },
  async (parcels: Parcel[], options: CommandOptions) => {
    logger.info('\n🐙 Commenting on issues closed by published changes');

    const payload = await generatePayloadForCommentatorAsync(parcels, options.tag);

    if (!payload.length) {
      logger.log('There are no closed issues to comment on\n');
      return;
    }
    if (options.dry) {
      logger.debug('Skipping due to --dry flag');
      logManualFallback(payload);
      return;
    }
    if (!process.env.GITHUB_TOKEN) {
      logger.error(
        'Environment variable `%s` must be set to dispatch a commentator workflow',
        chalk.magenta('GITHUB_TOKEN')
      );
      logManualFallback(payload);
      return;
    }

    const currentBranchName = await Git.getCurrentBranchNameAsync();

    // Sometimes we publish from different branches (especially for testing) where comments are not advisable.
    if (currentBranchName !== 'main') {
      logger.warn('This feature is disabled on branches other than main');
      logManualFallback(payload);
      return;
    }

    // Dispatch commentator workflow on GitHub Actions with stringified and escaped payload.
    await dispatchWorkflowEventAsync('commentator.yml', currentBranchName, {
      payload: JSON.stringify(payload).replace(/("|`)/g, '\\$1'),
    });
    logger.success(
      'Successfully dispatched commentator action for the following issues: %s',
      linksToClosedIssues(payload.map(({ issue }) => issue))
    );
  }
);

/**
 * Generates payload for `expotools commentator` command.
 */
async function generatePayloadForCommentatorAsync(
  parcels: Parcel[],
  tag: string
): Promise<CommentatorPayload> {
  // An object whose key is the issue number and value is an array of rows to put in the comment's body.
  const commentRows: Record<number, CommentRowObject[]> = {};

  // An object whose key is the pull request number and value is an array of issues it closes.
  const closedIssuesRegistry: Record<number, number[]> = {};

  for (const { pkg, state } of parcels) {
    const versionChanges = state.changelogChanges?.versions[UNPUBLISHED_VERSION_NAME];

    if (!versionChanges) {
      continue;
    }
    const allEntries = ([] as ChangelogEntry[]).concat(...Object.values(versionChanges));
    const allPullRequests = new Set(
      ([] as number[]).concat(...allEntries.map((entry) => entry.pullRequests ?? []))
    );

    // Visit all pull requests mentioned in the changelog.
    for (const pullRequest of allPullRequests) {
      // Look for closed issues just once per pull request to reduce number of GitHub API calls.
      if (!closedIssuesRegistry[pullRequest]) {
        closedIssuesRegistry[pullRequest] = await getClosedIssuesAsync(pullRequest);
      }
      const closedIssues = closedIssuesRegistry[pullRequest];

      // Visit all issues that have been closed by this pull request.
      for (const issue of closedIssues) {
        if (!commentRows[issue]) {
          commentRows[issue] = [];
        }

        // Check if the row for the package already exists. If it does, then just add
        // another pull request reference into that row instead of creating a new one.
        // This is to prevent duplicating packages within the comment's body.
        const existingRowForPackage = commentRows[issue].find((entry) => entry.pkg === pkg);

        if (existingRowForPackage) {
          existingRowForPackage.pullRequests.push(pullRequest);
        } else {
          commentRows[issue].push({
            pkg,
            version: state.releaseVersion!,
            pullRequests: [pullRequest],
          });
        }
      }
    }
  }

  return Object.entries(commentRows).map(([issue, entries]) => {
    return {
      issue: +issue,
      body: generateCommentBody(entries, tag),
    };
  });
}

/**
 * Logs a list of closed issues. We use it as a fallback in several places, so it's extracted.
 */
function logManualFallback(payload: CommentatorPayload): void {
  logger.log(
    'If necessary, you can still do this manually on the following issues: %s',
    linksToClosedIssues(payload.map(({ issue }) => issue))
  );
}

/**
 * Returns a string with concatenated links to all given issues.
 */
function linksToClosedIssues(issues: number[]): string {
  return issues
    .map((issue) => link(chalk.blue('#' + issue), `https://github.com/expo/expo/issues/${issue}`))
    .join(', ');
}

/**
 * Generates comment body based on given entries.
 */
function generateCommentBody(entries: CommentRowObject[], tag: string): string {
  const rows = entries.map(({ pkg, version, pullRequests }) => {
    const items = [
      linkToNpmPackage(pkg.packageName, version),
      version,
      pullRequests.map((pr) => '#' + pr).join(', '),
      linkToChangelog(pkg),
    ];
    return `| ${items.join(' | ')} |`;
  });

  return `<!-- Generated by \`expotools publish\` -->
Some changes in the following packages that may fix this issue have just been published to npm under \`${tag}\` tag 🚀

| 📦 Package | 🔢 Version | ↖️ Pull requests | 📝 Release notes |
|:--:|:--:|:--:|:--:|
${rows.join('\n')}

If you're using bare workflow you can upgrade them right away. We kindly ask you for some feedback—even if it works 🙏

They will become available in managed workflow with the next SDK release 👀

Happy Coding! 🎉`;
}

/**
 * Returns markdown link to the package on npm.
 */
function linkToNpmPackage(packageName: string, version: string): string {
  return `[${packageName}](https://www.npmjs.com/package/${packageName}/v/${version})`;
}

/**
 * Returns markdown link to package's changelog.
 */
function linkToChangelog(pkg: Package): string {
  const changelogRelativePath = path.relative(EXPO_DIR, pkg.changelogPath);
  return `[CHANGELOG.md](https://github.com/expo/expo/blob/main/${changelogRelativePath})`;
}

/**
 * Prompts whether you want the bot to comment on the issues to inform the users about the release.
 */
async function shouldCommentAsync(): Promise<boolean> {
  if (process.env.CI) {
    return false;
  }
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: 'confirm',
      name: 'proceed',
      prefix: '❔',
      message: chalk.yellow('Do you want the expo-bot to comment on these issues?'),
      default: false,
    },
  ]);
  return !proceed;
}
