import { Octokit } from "octokit";
import 'dotenv/config';
import fs from 'fs';

const RATE_LIMIT_TIMEOUT = 60000; // 1 minute

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
        name: 'timeout', alias: 't', type: Number,
        description: 'The timeout (in ms) between each API call to avoid rate limiting',
        required: false
    },
    {
        name: 'repofile', alias: 'f', type: String,
        description: 'A csv file containing the list of repositories to search (one per line) when action is search-files. The first column should be the full repo name (e.g., owner/repo).',
        required: false
    }
]

import commandLineArgs from 'command-line-args'
import { time } from "console";
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

    while (pagesRemaining) {
        let response = null;
        try {
            response = await octokit.request(`GET ${url}`, {
                per_page: 100,
                headers: {
                    "X-GitHub-Api-Version":
                        "2022-11-28",
                    Authorization: `token ${githubToken}`,
                },
            });
        }
        catch (error) {
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
        let retriesCount = 0;
        while (currentRow < reposCount) {
            let currentRepo = reposToSearch[currentRow];
            console.log(`Processing ${currentRow}/${reposCount - 1}: ${currentRepo}`);
            const repoFileResults = await processRepo(currentRepo, currentRow);

            if (repoFileResults === null) {
                currentRow--;
                console.log(`Retrying ${currentRepo} due to rate limit...`);
                retriesCount++;
                if (retriesCount > 2) {
                    console.log('Too many retries. Exiting.');
                    saveProgress(currentRow);
                    break;
                }
                waitForTimeout(true);
                continue;
            } else {
                waitForTimeout(false);
            }

            if (repoFileResults.length > 0) {
                process.stdout.write(' ***');
                fileSearchResults.push(...repoFileResults);
            }
            currentRow++;
        }
        saveProgress(currentRow);
        saveFileSearchResults(fileSearchResults, startRow > 0);
        break;

    default:
        console.log(`Unknown action: ${options.action}`);
        process.exit(1);
}


function onFileSearchExit(results, resumed) {
    process.on('exit', () => {
        console.log('Exiting. Saving progress...');
        saveFileSearchResults(results, resumed);
    });

    // catches ctrl+c event
    process.on('SIGINT', () => {
        console.log('Caught interrupt signal. Saving progress...');
        saveFileSearchResults(results, resumed);
        process.exit();
    });
}

function saveFileSearchResults(results, resumed) {
    const csvHeader = 'repo, file_path';
    if (resumed) {
        results.unshift(csvHeader);
    }
    fs.writeFileSync('file_search_results.csv', results.join('\n'));
    console.log(`\nWrote ${results.length - 1} records to file_search_results.csv`);
}

function saveProgress(row) {
    fs.writeFileSync('progress.txt', row);
}

function loadProgress() {
    if (fs.existsSync('progress.txt')) {
        const row = fs.readFileSync('progress.txt', 'utf-8');
        return parseInt(row);
    }
    return 0;
}

async function waitForTimeout(rateLimitReset) {
    var timeout = rateLimitReset ? RATE_LIMIT_TIMEOUT : options.timeout;
    await new Promise(resolve => setTimeout(resolve, timeout));
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

