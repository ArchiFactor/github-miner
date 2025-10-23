## Basic Usage

# Search for repositories with specific files and content

`
node index.js --action=search-files --query='\"react\" \"react-dom\" filename:package.json -path:node_modules -path:examples in:file' --timeout=1000 --repofile=test-repos.csv
`

# Notes

Exclude entries which contain the following keywords in packages.json path
`template, test, example, fixture, benchmark, integration, plugin, demo, packages?, npm-package, playground, solution, sandbox, tutorial, sample, curriculum, boilerplate, exercise, assignment,sketches`

Exclude repos with the following keywords in repo name:
`example, sample`



