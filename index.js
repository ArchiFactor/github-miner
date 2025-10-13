// Example: Fetch public repositories for a GitHub user
import { request } from 'undici';
const githubToken = process.env.GITHUB_KEY;
console.log('Using GitHub token:', githubToken);

async function searchRepos(query) {
    const url = `https://api.github.com/search/repositories?per_page=400&page=1&q=${encodeURIComponent(query)}`;
    console.log('Requesting URL:', url);
    const { statusCode, headers, body } = await request(url, {
        headers: {
            'User-Agent': 'request',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${githubToken}`
        }
    });

    if (! statusCode || statusCode !== 200) {
        throw new Error(`GitHub API error: ${statusCode}`);
    }
    const repos = await body.json();
    return repos;
}

// Usage example
searchRepos('(react in:topic AND NOT android in:topic  AND NOT "react-native" in:topic) stars:>1000 sort:stars-desc pushed:>2024-01-01')
    .then(repos => {
        console.log('Found repositories:', repos.total_count);
        let repo_names = repos.items.map(repo => {
            return `${repo.full_name} - ${repo.stargazers_count}: stars}`;
        })
        console.log('Repository names:', repo_names);
    })
    .catch(err => console.error(err));

