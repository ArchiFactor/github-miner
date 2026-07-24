import { Octokit } from "octokit";
import 'dotenv/config';
import fs from 'fs';

const INPUT_FILE = 'datasets/repos-at-least-100stars-100pushes-2020-2024.csv';
const OUTPUT_FILE = 'datasets/java-repos-at-least-100stars-100pushes-2020-2024.csv';
const PROGRESS_FILE = 'filter-progress.txt';
const BATCH_SIZE = 100;
const TARGET_LANGUAGE = 'Java';

const octokit = new Octokit({ auth: process.env.GITHUB_KEY });

const rows = fs.readFileSync(INPUT_FILE, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.includes('/')); // drops the header and empty lines

let startBatch = 0;
if (fs.existsSync(PROGRESS_FILE)) {
    startBatch = parseInt(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    console.log(`Resuming from batch ${startBatch}`);
} else {
    fs.writeFileSync(OUTPUT_FILE, 'name,stars,pushes');
}

const seen = new Set();
const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

for (let batch = startBatch; batch < totalBatches; batch++) {
    const batchRows = rows.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
    const fields = batchRows.map((row, i) => {
        const [owner, name] = row.split(',')[0].split('/');
        return `r${i}: repository(owner: "${owner}", name: "${name}") { nameWithOwner primaryLanguage { name } }`;
    });
    const query = `{ rateLimit { cost remaining resetAt } ${fields.join('\n')} }`;

    let data;
    try {
        data = await octokit.graphql(query);
    } catch (error) {
        if (error.data) {
            // Partial response: deleted/inaccessible repos come back as null
            data = error.data;
        } else {
            console.log(`Batch ${batch} failed: ${error.message}. Retrying in 60s...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            batch--;
            continue;
        }
    }

    const javaRepos = [];
    batchRows.forEach((row, i) => {
        const repo = data[`r${i}`];
        if (repo?.primaryLanguage?.name === TARGET_LANGUAGE && !seen.has(repo.nameWithOwner)) {
            seen.add(repo.nameWithOwner);
            const [, stars, pushes] = row.split(',');
            javaRepos.push(`${repo.nameWithOwner},${stars},${pushes}`);
        }
    });

    if (javaRepos.length > 0) {
        fs.appendFileSync(OUTPUT_FILE, '\n' + javaRepos.join('\n'));
    }
    fs.writeFileSync(PROGRESS_FILE, "" + (batch + 1));

    const rateLimit = data.rateLimit;
    console.log(`Batch ${batch + 1}/${totalBatches}: +${javaRepos.length} Java repos (total ${seen.size}). Query cost: ${rateLimit?.cost}, points remaining: ${rateLimit?.remaining}`);

    if (rateLimit && rateLimit.remaining < 100) {
        const waitMs = Math.max(new Date(rateLimit.resetAt).getTime() - Date.now(), 0) + 5000;
        console.log(`Rate limit low. Waiting ${Math.round(waitMs / 60000)} minutes until reset...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
}

console.log(`Done. Wrote ${seen.size} Java repos to ${OUTPUT_FILE}`);
