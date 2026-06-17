# Github Miner Utility

Simple utility to filter a list of github repositories based on the content of specific files.
The list of repositories given as input is provided as parameter `--repofile`.
You can use the `datasets\repos-at-least-100stars-100pushes-2020-2024.csv` file as input that contains repos with at least 100 stars and 100 pushes in the period 2020-2024. 
Details on repo list collection are available [here](data-collection.md).

The actual query that is submitted through the Github API is provided with the `--query` parameter.
The query string should be a valid Github search query, as the ones provided through the Github file search page.

The `search-repos` action is under development.

Filtered results are saved to file `file_search_results.csv`. 
Result syncing with disk takes place on the arrival of 10 newly collected results.
In case that the utility is interrupted, all retrieved results are synced to disk.

To resume from a specific row of the `--repofile` write the row number in a `progress.txt` file
created in the project root directory.


## Basic Usage

Export the GITHUB_KEY environment variable with your Github key and run the `search-files` action (see below).

## Search for repositories with specific files and content

### Example 1: Search repos with specific contents in package.json

For instance, search repos containing `react` or `react-dom` in file package.json.
Excluded directories for search are `node_modules` and `examples`.

`
node index.js --action=search-files --query='\"react\" \"react-dom\" filename:package.json -path:node_modules -path:examples in:file'  --repofile=repos.csv
`

### Example 2: Search repos with specific contents in pom.xml

WIP

### Notes for further repo exclusion (not implemented)

Exclude entries which contain the following keywords in package.json path
`template, test, example, fixture, benchmark, integration, plugin, demo, packages, npm-package, playground, solution, sandbox, tutorial, sample, curriculum, boilerplate, exercise, assignment,sketches`

Exclude repos with the following keywords in repo name:
`example, sample`



