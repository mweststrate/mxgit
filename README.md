Welcome to MXGIT
=====
Mxgit: Small tool that helps versioning Mendix projects with git.
NPM page: [https://www.npmjs.org/package/mxgit](https://www.npmjs.org/package/mxgit)

The following features of the Mendix Business Modeler will work on git repositories when using mxgit:
* Track changes, see changed documents
* Revert documents inside the Mendix Business Modeler
* Investigate and solve merge conflicts

Mxgit integrates nicely in the git workflow, and should be picked up by git or any other git managing tool nicely if `mxgit --install` is run inside a repository. Mxgit runs on both windows and linux.

Mxgit simulates an Teamserver / SVN repository which is recognized by the Mendix Business Modeler, so that it can properly detect changes and conflicts, in the same way as when working on normal Teamserver repositories. The simulated SVN repository is recognized by the Mendix Business Modeler, TortoiseSVN and svn commandline. But, since this is not a real repository normal SVN will not work and should not be used. Mxgit works with SVN 1.7, so it should compatible with all known versions of Mendix 4 and Mendix 5.

The following function of the Modeler will **not work** from *within* the Modeler (but will work with git commands):
* Updating and committing
* Branching & merging
* History
* Adding and reverting non mpr files
* Sandbox deployments and initiating builds in the build server will not work at all.

# Installation

## Prerequisites

### Windows
You need to have nodejs and npm install. It can be downloaded from [nodejs.org](https://nodejs.org).

### Linux
You need to have nodejs, npm and sqlite3 installed. On debian based systems you can install those packages by running `sudo apt-get install nodejs npm sqlite3`.

## Installation

Just run `npm install -g mxgit`. You might need to run the command as administrator.

# Getting started

*TL;DR*: Run `mxgit --install` in the root your git working copy (which should also be the root of your Mendix project directory).

You can run this tool by executing `mxgit` in any directory that contains an .mpr file and is not managed yet by a teamserver repository. (You can easily detach the working copy by removing the .svn directory or using the export function in (tortoise)SVN). The directory needs to be under git control already. Use `git init` to initialize a new git repository if needed.

When `mxgit` is being run, it checks the current status of the git repository and copies it to the 'svn' status in such a way that the modeler will pick it up. This means that the tool will automatically set up the correct base revisions and conflict data if applicable. Usually, after running mxgit the model should be reopened in the modeler to make sure that the new state is picked up.

If you don't want to run `mxgit` manually when updating or committing to this git repository, use `mxgit --install` to set up git hooks. Note that the project should be closed when executing git commands like commit, merge, pull or checkout, so that the internal state of the Business Modeler doesn't get outdated. mxgit will warn if a project should be closed first.

NOTE: DO NOT USE SVN OR SVN RELATED TOOLS (SUCH AS THE MODELER BUILT-IN FUNCTIONS FOR UPDATE, COMMIT, BRANCH, MERGE, HISTORY) ON REPOSITORIES MANAGED BY GIT + MXGIT DIRECTLY, THEY WON'T WORK

# Options

## mxgit --install

Registers git hooks so that the `mxgit` command doesn't need to be called manually after pull, merging, committing etc.

## mxgit --reset

Unregisters any hooks and removes all svn (meta)data. If your working copy is clean, this is a safe operation.

## mxgit --setprojectid &lt;project id&gt;

Sets the project id to the specified id, so that the stories and deployment integration in the modeler still (partially) work, despite the fact that this project is not a real team server project. You can find the project id under the project settings of the home.mendix.com project you want to connect it to.

## mxgit --precommit

Command used internally by the git hooks. Checks whether the state of the current repository is safe enough to perform a git command. Git commits should not be performed when the model still has conflicts.

## mxgit --postupdate

Command used internally by the git hooks. Refreshes the base and conflict information of SVN, and should be called after any operation that might alter the current working copy. Basically the same as just running `mxgit`, except that some errors are ignored.

## mxgit --merge base_mprfile left_mprfile right_mprfile

Command used internally by the git merge driver but can be called manually as well. Prepares the modeler for a three-way merge. It takes three filenames as parameters; base file (a common ancestor), left file ('ours') and right file ('theirs').

## verbose flag (`-v`)

Be chatty about all the things

# Known Issues

* --setprojectid can be only once. Use --reset first to assign a new project id.
* --install will not register git hooks if similar git hooks already exists. Please fix this manually by either calling `mxgit --precommit` or `mxgit --postupdate`
* SVN icons, status, history etc .. doesn't make any sense
* The modeler will always indicate that at least the project file is changed. This usually isn't the case. Check `git status` to be sure.

# License
This tool is unofficial and not supported by Mendix; use it at your own risk. Feel free to report any issues.

Licensed under the MIT license

# Developers notes

* git clone this repository
* run `npm install` to download the dependencies
* run `npm link` to put the current checkout of this tool on your path
