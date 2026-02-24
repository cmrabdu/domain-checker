# domain-checker

> A lightweight CLI tool to check domain name availability using **DNS resolution** and **whois lookups**. Zero external dependencies.

![Node.js](https://img.shields.io/badge/node-%3E%3D14-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Zero dependencies](https://img.shields.io/badge/dependencies-zero-success)

---

## Features

- **Dual-check strategy** — DNS first (fast), whois as fallback (accurate)
- **Configurable TLDs** — check any combination of extensions
- **File input** — pass a `.txt` file with one name per line
- **JSON & CSV export** — pipe results into other tools or save them
- **`--quiet` mode** — only print available domains
- **No external npm packages** — uses only Node.js built-ins + system `whois`

---

## Requirements

| Dependency | Notes |
|---|---|
| **Node.js ≥ 14** | [nodejs.org](https://nodejs.org) |
| **`whois` CLI** | Pre-installed on macOS and most Linux distros |

> **Windows:** `whois` is not bundled. Install it via [Sysinternals](https://learn.microsoft.com/en-us/sysinternals/downloads/whois) or use WSL.

---

## Installation

### Run directly (no install)

```bash
git clone https://github.com/cmrabdu/domain-chekcer.git
cd domain-chekcer
node domain-checker.js myapp mysite
```

### Install globally via npm

```bash
npm install -g .
domain-checker myapp mysite
```

---

## Usage

```
domain-checker [options] [names...]
```

### Arguments

| Argument | Description |
|---|---|
| `names` | One or more base names to check (e.g. `myapp coolsite`) |

### Options

| Option | Default | Description |
|---|---|---|
| `-e, --extensions <list>` | `.com,.io,.app,.org` | Comma-separated TLD list |
| `-f, --file <path>` | — | Text file with one base name per line |
| `-o, --output <path>` | — | Save results to a `.json` or `.csv` file |
| `-d, --delay <ms>` | `350` | Delay between checks (ms) |
| `--json` | — | Print results as JSON (machine-readable) |
| `-q, --quiet` | — | Only print available domains |
| `-v, --version` | — | Print version |
| `-h, --help` | — | Show help |

---

## Examples

**Check a few names across default TLDs**
```bash
node domain-checker.js myapp coolsite
```

**Check specific extensions**
```bash
node domain-checker.js -e .com,.io,.fr myapp
```

**Read names from a file**
```bash
node domain-checker.js -f examples/domains.example.txt
```

**Export results to JSON**
```bash
node domain-checker.js myapp -e .com,.io -o results.json
```

**Export results to CSV**
```bash
node domain-checker.js myapp -e .com,.io -o results.csv
```

**Only show available domains (quiet mode)**
```bash
node domain-checker.js -f examples/domains.example.txt -q
```

**JSON output (great for scripting)**
```bash
node domain-checker.js myapp --json | jq '.[] | select(.available == true)'
```

---

## Input file format

Create a plain text file with one base name per line. Lines starting with `#` are treated as comments.

```
# examples/my-domains.txt
myapp
coolsite
awesomeproject
```

Then run:
```bash
node domain-checker.js -f my-domains.txt -e .com,.io
```

---

## Sample output

```
Domain Checker  DNS + whois · 8 domain(s)

  myapp.com                     ✗  taken  (dns:A)
  myapp.io                      ✓  available
  myapp.app                     ✗  taken  (whois:record)
  myapp.org                     ✗  taken  (dns:NS)
  coolsite.com                  ✗  taken  (dns:A)
  coolsite.io                   ✓  available
  coolsite.app                  ✓  available
  coolsite.org                  ✗  taken  (dns:A)

──────────────────────────────────────────────────

Available (3)
  myapp.io
  coolsite.io
  coolsite.app

Taken: 5

──────────────────────────────────────────────────

Tip: Always confirm on namecheap.com or porkbun.com before purchasing.
```

---

## How it works

The script uses a two-step strategy:

1. **DNS check** — Queries A, NS, and MX records. If any resolves, the domain is taken.  
   This is fast and reliable for registered domains.

2. **whois check** — Runs the system `whois` command on the domain.  
   The output is parsed for known "free" and "taken" signals.  
   Some TLD registries (e.g. `.app`, `.io`) return only TLD-level data, so the script falls back to the DNS result in ambiguous cases.

> Results marked `dns-clean+whois-tld` mean DNS returned nothing and whois only showed TLD-level info — the domain is very likely available, but confirming with a registrar is recommended.

---

## Result schema (JSON)

Each result object looks like this:

```json
{
  "domain": "myapp.io",
  "available": true,
  "method": "whois:free"
}
```

| Field | Type | Description |
|---|---|---|
| `domain` | string | Full domain name checked |
| `available` | `true` / `false` / `null` | Availability result (`null` = timeout/undetermined) |
| `method` | string | How the result was determined |

### Method values

| Value | Meaning |
|---|---|
| `dns:A` / `dns:NS` / `dns:MX` | Taken — DNS record found |
| `whois:record` | Taken — domain record found in whois |
| `whois:registrar` | Taken — registrar info found in whois |
| `whois:free` | Available — whois returned a "free" signal |
| `dns-clean+whois-tld` | Likely available — no DNS, no registrar info |
| `timeout` | Undetermined — whois timed out |

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add something'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

[MIT](LICENSE) © cmrabdu
