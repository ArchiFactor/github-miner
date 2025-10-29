# Data collection

## Collection of highly rated repos

We have collected highly rated repos through mining the GithubArchive public BigQuery dataset.
Data collection involved the following queries

### Repos with at least 100 stars within 2020-2024

``` sql
SELECT name, sum(watch_count) as stars
FROM (
select *
from
(SELECT
   repo.name,
   COUNT(*) watch_count
FROM
 `githubarchive.year.2020`
WHERE type="WatchEvent"
GROUP BY repo.name
having watch_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) watch_count
FROM
 `githubarchive.year.2021`
WHERE type="WatchEvent"
GROUP BY repo.name
having watch_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) watch_count
FROM
 `githubarchive.year.2022`
WHERE type="WatchEvent"
GROUP BY repo.name
having watch_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) watch_count
FROM
 `githubarchive.year.2023`
WHERE type="WatchEvent"
GROUP BY repo.name
having watch_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) watch_count
FROM
 `githubarchive.year.2024`
WHERE type="WatchEvent"
GROUP BY repo.name
having watch_count > 10)
) group by name
ORDER BY STARS DESC

```

The result is stored in table repo_stars

### Repos with at least 100 pushes within 2020-2024

```sql
SELECT name, sum(push_count) as pushes
FROM (
select *
from
(SELECT
   repo.name,
   COUNT(*) push_count
FROM
 `githubarchive.year.2020`
WHERE type="PushEvent"
GROUP BY repo.name
having push_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) push_count
FROM
 `githubarchive.year.2021`
WHERE type="PushEvent"
GROUP BY repo.name
having push_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) push_count
FROM
 `githubarchive.year.2022`
WHERE type="PushEvent"
GROUP BY repo.name
having push_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) push_count
FROM
 `githubarchive.year.2023`
WHERE type="PushEvent"
GROUP BY repo.name
having push_count > 10)
union all
(SELECT
   repo.name,
   COUNT(*) push_count
FROM
 `githubarchive.year.2024`
WHERE type="PushEvent"
GROUP BY repo.name
having push_count > 10)
) group by name
ORDER BY STARS DESC

```

Results are stored in table repo_pushes

### Repos with at least 100 stars and 100 pushes within 2020-2024

```sql
SELECT a.name as repo, a.stars as stars, b.pushes as pushes
FROM `project.dataset.repo_stars` as a
inner join `project.dataset.repo_pushes` as b
on a.name = b.name
where a.stars > 100 and b.pushes > 100
order by stars desc
```