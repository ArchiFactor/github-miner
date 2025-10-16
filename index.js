import { Octokit } from "octokit";
import 'dotenv/config';
import fs from 'fs';

const octokit = new Octokit({});
const githubToken = process.env.GITHUB_KEY;

let query = '( (react in:topic OR javascript in:topic OR typescript in:topic) AND NOT android in:topic  AND NOT "react-native" in:topic) stars:>1000 sort:stars-desc pushed:>2024-01-01';

let url = `/search/repositories?per_page=100&page=1&q=${encodeURIComponent(query)}`;

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
        const response = await octokit.request(`GET ${url}`, {
            per_page: 100,
            headers: {
                "X-GitHub-Api-Version":
                    "2022-11-28",
                Authorization: `token ${githubToken}`,
            },
        });
        process.stdout.write('.'); // progress indicator
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

const data = await getPaginatedData(url, repositorySearchProjection);

const csvHeader = 'repo, stars';
data.unshift(csvHeader);

fs.writeFileSync('results.csv', data.join('\n'));
console.log(`\nWrote ${data.length - 1} records to results.csv`);
