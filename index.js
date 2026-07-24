import { Octokit } from "octokit";
import 'dotenv/config';
import fs from 'fs';

const RATE_LIMIT_TIMEOUT = 60000; // 1 minute
const MAX_RATE_LIMIT_RETRIES = 5;
let headerWritten = false;

const optionDefinitions = [
    {
        name: 'action', alias: 'a', type: String,
        description: 'The action to perform. Currently supported actions: search-repos, search-files',
        required: true
    },
    {
        name: 'query', alias: 'q', type: String,
        description: 'The search query to use during each search type',
        required: true
    },
    {
        name: 'filter', alias: 'e', type: String,
        description: 'Keywords that should not be present in file paths resulting from file search actions',
        required: false
    },
    {
        name: 'repofile', alias: 'f', type: String,
        description: 'A csv file containing the list of repositories to search (one per line) when action is search-files. The first column should be the full repo name (e.g., owner/repo).',
        required: false
    }
]

import commandLineArgs from 'command-line-args'
const options = commandLineArgs(optionDefinitions)

const octokit = new Octokit({});
const githubToken = process.env.GITHUB_KEY;

let default_query = '( (react in:topic OR javascript in:topic OR typescript in:topic) AND NOT android in:topic  AND NOT "react-native" in:topic) stars:>1000 sort:stars-desc pushed:>2024-01-01';

let url = `/search/repositories?per_page=100&page=1&q=${encodeURIComponent(default_query)}`;

/**
 * Fetches all paginated data from a GitHub API endpoint.
 * @param {The requested url} url 
 * @param {Function that projects the returned json to another object} projection 
 * @returns 
 */
async function getPaginatedData(url, projection) {
    const nextPattern = /(?<=<)([\S]*)(?=>; rel="Next")/i;
    let pagesRemaining = true;
    let data = [];
    let retries = 0;

    while (pagesRemaining) {
        let response = null;
        try {
            response = await octokit.request(`GET ${url}`, {
                headers: {
                    "X-GitHub-Api-Version":
                        "2022-11-28",
                    Authorization: `token ${githubToken}`,
                },
            });
        }
        catch (error) {
            const headers = error.response?.headers ?? {};
            console.log(`\nRequest failed with status ${error.status}: ${error.message}`);
            console.log(`x-ratelimit-remaining: ${headers['x-ratelimit-remaining']}, x-ratelimit-reset: ${headers['x-ratelimit-reset']}, retry-after: ${headers['retry-after']}`);
            if (error.status === 403 && retries < MAX_RATE_LIMIT_RETRIES) {
                retries++;
                let waitMs = RATE_LIMIT_TIMEOUT;
                if (headers['retry-after']) {
                    waitMs = Number(headers['retry-after']) * 1000;
                } else if (headers['x-ratelimit-reset']) {
                    waitMs = Math.max(Number(headers['x-ratelimit-reset']) * 1000 - Date.now(), 0) + 2000;
                }
                console.log(`Rate limit hit. Waiting ${Math.round(waitMs / 1000)}s before retrying (attempt ${retries}/${MAX_RATE_LIMIT_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }
            return null;
        }

        const parsedData = projection(parseData(response.data));
        data = [...data, ...parsedData];

        const linkHeader = response.headers.link;

        pagesRemaining = linkHeader && linkHeader.includes(`rel=\"next\"`);

        if (pagesRemaining) {
            url = linkHeader.match(nextPattern)[0];
        }
    }

    return data;
}

function repositorySearchProjection(repos) {
    let repo_names = repos.map(repo => {
        return `${repo.full_name}, ${repo.stargazers_count}`;
    })
    return repo_names;
}

/**
 * 
 * @param {JSON response} data 
 * @returns List with data items for the specific response
 */
function parseData(data) {
    // If the data is an array, return that
    if (Array.isArray(data)) {
        return data
    }
    // Some endpoints respond with 204 No Content instead of empty array
    //   when there is no data. In that case, return an empty array.
    if (!data) {
        return []
    }

    // Otherwise, the array of items that we want is in an object
    // Delete keys that don't include the array of items
    delete data.incomplete_results;
    delete data.repository_selection;
    delete data.total_count;
    // Pull out the array of items
    const namespaceKey = Object.keys(data)[0];
    data = data[namespaceKey];

    return data;
}


switch (options.action) {
    case 'search-repos':
        if (options.query) {
            url = `/search/repositories?per_page=100&page=1&q=${encodeURIComponent(options.query)}`;
        }
        const data = await getPaginatedData(url, repositorySearchProjection);
        const csvHeader = 'repo, stars';
        data.unshift(csvHeader);
        fs.writeFileSync('results.csv', data.join('\n'));
        console.log(`\nWrote ${data.length - 1} records to results.csv`);
        break;

    case 'search-files':
        if (!options.repofile) {
            console.log('Please provide a file containing the list of repositories to search using the -f option.');
            process.exit(1);
        }

        const fileSearchResults = [];
        const reposToSearch = getReposFromFile();
        const reposCount = reposToSearch.length;

        var startRow = loadProgress();
        console.log(`Resuming from row ${startRow}`);

        onFileSearchExit(fileSearchResults, startRow > 0);

        let currentRow = startRow;

        while (currentRow < reposCount) {
            let currentRepo = reposToSearch[currentRow];
            console.log(`Processing ${currentRow}/${reposCount - 1}: ${currentRepo}`);
            const repoFileResults = await processRepo(currentRepo, currentRow);

            if (repoFileResults === null) {
                console.log(`Skipping ${currentRepo} after repeated request failures.`);
            } else if (repoFileResults.length > 0) {
                process.stdout.write(' ***');
                fileSearchResults.push(...repoFileResults);
            }
            // Sync to disk 10 latest results
            if (fileSearchResults.length >= 10) {
                saveFileSearchResults(fileSearchResults, startRow > 0);
                fileSearchResults.length = 0;
                saveProgress(currentRow + 1);
            }
            currentRow++;
        }
        saveProgress(currentRow);
        saveFileSearchResults(fileSearchResults, startRow > 0);
        filterFileSearchResults(options.filter, 'file_search_results.csv', 'filtered-search-results.csv')
        break;

    default:
        console.log(`Unknown action: ${options.action}`);
        process.exit(1);
}

function filterFileSearchResults(keywords, inputCSVFile, outputCSVFile) {
    if (keywords === undefined || keywords.length === 0) {
        return
    }
    let keywordsList = keywords.split(",").map(keyword => keyword.trim())
    console.log(keywordsList)
    let inputRows = readCSV(inputCSVFile)
    let exclusionRegEx = new RegExp(keywordsList.join('|'))
    console.log(exclusionRegEx)
    // check file path (column 3) for the pattern and exclude it
    //console.log(exclusionRegEx.test('packages/next/src/compiled/react-server-dom-webpack/package.json'))
    let filteredRows = inputRows.filter(row => !exclusionRegEx.test(row[2]))

    console.log(filteredRows.length)
    fs.writeFileSync(outputCSVFile, filteredRows.join('\n'));
}

function onFileSearchExit(results, resumed) {
    // catches ctrl+c event
    process.on('SIGINT', () => {
        console.log('Caught interrupt signal. Saving progress...');
        saveFileSearchResults(results, resumed);
        process.exit();
    });
}

function saveFileSearchResults(results, resumed) {
    if (results.length === 0) {
        return;
    }
    const csvHeader = 'repo, file_path';
    if (!resumed && !headerWritten) {
        results.unshift(csvHeader);
    }
    headerWritten = true;
    fs.appendFileSync('file_search_results.csv', '\n' + results.join('\n'));
    console.log(`\nWrote ${results.length} records to file_search_results.csv`);
}

function saveProgress(row) {
    fs.writeFileSync('progress.txt', "" + row);
}

function loadProgress() {
    if (fs.existsSync('progress.txt')) {
        const row = fs.readFileSync('progress.txt', 'utf-8');
        return parseInt(row);
    }
    return 0;
}

async function processRepo(repo, repoIdx) {
    const query = `repo:${repo} ${options.query} `;
    const fileSearchUrl = `/search/code?per_page=100&page=1&q=${encodeURIComponent(query)}`;
    console.log(`Repository: ${repo}`);

    const repoFileResults = await getPaginatedData(fileSearchUrl, (items) => {
        return items.map(item => {
            return `${repoIdx},${item.repository.full_name},${item.path}`;
        });
    });

    return repoFileResults;
}

function getReposFromFile() {
    return fs.readFileSync(options.repofile, 'utf-8')
        .split('\n').filter(line => line.trim() !== '')
        .map(line => line.split(',')[0].trim());
}

function readCSV(file) {
    return fs.readFileSync(file, 'utf-8')
        .split('\n').filter(line => line.trim() !== '')
        .map(line => line.split(','))
        .filter(row => row.length > 0)
}

