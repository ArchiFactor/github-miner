## Basic Usage

# Search for repositories with specific files and content

`
node index.js --action=search-files --query='\"react\" \"react-dom\" filename:package.json -path:node_modules -path:examples in:file' --timeout=1000 --repofile=test-repos.csv
`



