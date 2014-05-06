Welcome to MXGIT
=====
DISCLAIMER: DO NOT USE SVN OR SVN RELATED TOOLS (SUCH AS THE MODELER BUILT-IN FUNCTIONS FOR UPDATE, COMMIT, BRANCH, MERGE, HISTORY) ON REPOSITORIES MANAGED BY GIT + MXGIT DIRECTLY.

mxgit is small utlity that makes working with git in mendix projects a breeze. It simulates an Teamserver / SVN repository so that the modeler can properly detect changes and conflicts, in the same way as when working on normal repositories. The tool should work under both windows and linux (this useful when operating on disks mounted in windows VM's). 

The following features of the Mendix Business Modeler will work on git repositories when using mxgit:
* Track changes, see changed documents
* Rever documents inside the Mendix Business Modeler
* Investigate and solve merge conflicts
* Note that after updating or committing the git repository, the model usually needs to be reopened to update the current state in the modeler. 

# Installation

The tool can be installed by using `npm`: `npm install -g mxgit`. 

If you don't have nmp / node installed on your machine, obtain it at (nodejs.org)[https://nodejs.org] or from your package manager.

When using the tool under linux, `sqlite3` is a required dependency as well. (on Debian distro's, just `sudo apt-get install sqlite3`). 

mxgit works with SVN 1.7, so it should compatible with all known versions of Mendix 4 and Mendix 5. 

# Getting started

You can run this tool by executing `mxgit` in any directory that contains an .mpr file and is not managed yet by a teamserver repository. (You can easily detach the working copy by removing the .svn directory or using the export function in (tortoise)SVN). The directory needs to be under git control already. Use `git init` to initialize a new git repository if needed. 

When `mxgit` is being run, it checks the current status of the git repository and copies it to the 'svn' status in such a way that the modeler will pick it up. This means that the tool will automatically set up the correct base revisions and conflict data if applicable. Usually, after running mxgit the model should be reopened in the modeler to make sure that the new state is picked up. 

If you don't want to run `mxgit` manually when updating or commiting to this git repository, use `mxgit --install` to set up git hooks. 


# Options

## mxgit --install

Registers git hooks so that the `mxgit` command doesn't need to be called manually after pull, merging, commiting etc. 

## mxgit --reset

Unregisters any hooks and removes all svn (meta)data. If your working copy is clean, this is a safe operation.

## mxgit --setprojectid &lt;project id&gt;

Sets the project id to the specified id, so that the stories and deployment integration in the modeler still (partially) work, despite the fact that this project is not a real team server project. You can find the project id under the project settings of the home.mendix.com project you want to connect it to. 

## mxgit --precommit

Command used internally by the git hooks. Checks whether the state of the current repository is safe enough to perform a git command. Git commits should not be performed when the model still has conflicts. 

## mxgit --postupdate

Command used internally by the git hooks. Refreshes the base and conflict information of SVN, and should be called after any operation that might alter the current working copy. Basically the same as just running `mxgit`, except that some errors are ignored. 

## verbose flag (`-v`)

Be chatty about all the things

# Known Issues

* SVN revert reverts to the wrong file
* SVN icons, status, history etc .. doesn't make any sense

# License
This tool is unofficial and not supported by Mendix; use it at your own risk.but feel free to report any issues. 

Licensed under the MIT license

# Developers notes

* git clone this repository
* run `npm install` to download the dependencies
* run `npm link` to put the current checkout of this tool on your path