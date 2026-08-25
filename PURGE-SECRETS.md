# Purging the leaked files from git history

The current commit stops tracking `.env.local` and `sipngo.db`, but **every
earlier commit still contains them**. Anyone can read the old JWT secret and the
customer records by checking out an old revision. Removing a file in a new
commit does not remove it from history.

Two things have to happen: rotate the secret, and rewrite history.

---

## 1. Rotate the secret (do this first)

A new `JWT_SECRET` was already generated into your local `.env.local`. Rotating
it invalidates every existing session, so all users are signed out once. That is
the intended outcome — the old key is public.

Set the same value wherever the app is deployed, then confirm nothing still
reads the old one.

To generate another:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Also assume the seeded `admin@sipngo.com` / `admin123` account is compromised.**
Change that password, or delete the account and re-seed from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`.

## 2. Consider the customer data already exposed

`sipngo.db` was public and held 3 accounts (email, name, bcrypt hash) and 5
orders. The hashes are bcrypt so they are not trivially reversible, but the
email addresses were readable by anyone. Depending on where you operate this may
be a notifiable personal-data breach — worth checking before you decide how
quietly to handle it. At minimum, tell those users to change their password if
they reused it anywhere.

## 3. Rewrite history

Rewriting public history changes every commit hash. Anyone with a clone must
re-clone. Since this repo has no other contributors, that cost is low.

Install `git-filter-repo` (the tool the Git project recommends over
`filter-branch`):

```bash
pip install git-filter-repo
```

Work on a **fresh mirror clone**, never your working copy:

```bash
git clone --mirror https://github.com/hotmans6969/SipNGo.git SipNGo-purge.git
```

Strip both files from every commit:

```bash
cd SipNGo-purge.git && git filter-repo --invert-paths --path .env.local --path sipngo.db
```

Check they are gone — this should print nothing:

```bash
git log --all --oneline -- .env.local sipngo.db
```

Then force-push the rewritten history:

```bash
git push --force --all && git push --force --tags
```

`git filter-repo` drops the remote on purpose, so if the push fails with "no
configured push destination", re-add it first:

```bash
git remote add origin https://github.com/hotmans6969/SipNGo.git
```

## 4. Clean up GitHub's copies

Force-pushing does not reach everything:

- **Forks** keep the old objects. If anyone forked this, the secrets stay
  readable in the fork. Check the repo's fork list.
- **Pull requests** keep their own refs, which survive a rewrite.
- **Cached views.** Old commit URLs can stay reachable for a while. Ask GitHub
  Support to garbage-collect if you need them gone immediately.

If the repo does not need to be public, making it private is faster and more
certain than any of the above.

## 5. Stop it happening again

`.github/workflows/secret-scan.yml` runs gitleaks on every push and pull
request. For local protection, add a pre-commit hook:

```bash
pip install pre-commit detect-secrets
```

Then create `.pre-commit-config.yaml` with a `detect-secrets` hook and run
`pre-commit install`.
