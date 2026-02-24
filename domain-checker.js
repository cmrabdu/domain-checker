#!/usr/bin/env node

/**
 * domain-checker — CLI tool to check domain name availability
 * Uses DNS resolution + whois lookups. No external dependencies.
 *
 * https://github.com/cmrabdu/domain-chekcer
 * License: MIT
 */

'use strict';

const dns  = require('dns').promises;
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ─── ANSI colours (auto-disabled when not a TTY) ──────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset:  s => isTTY ? `\x1b[0m${s}\x1b[0m`  : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    s => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
};

// ─── CLI help ─────────────────────────────────────────────────────────────

const HELP = `
${c.bold('domain-checker')} — Check domain name availability via DNS + whois

${c.bold('Usage')}
  domain-checker [options] [names...]

${c.bold('Arguments')}
  names                     One or more base names to check (e.g. myapp coolsite)

${c.bold('Options')}
  -e, --extensions <list>   Comma-separated TLD list  (default: .com,.io,.app,.org)
  -f, --file <path>         Text file with one base name per line
  -o, --output <path>       Save results to a .json or .csv file
  -d, --delay <ms>          Delay between checks in ms  (default: 350)
  --json                    Print all results as JSON (machine-readable)
  -q, --quiet               Only print available domains
  -v, --version             Print version
  -h, --help                Show this help

${c.bold('Examples')}
  domain-checker myapp mysite
  domain-checker -e .com,.io,.fr myapp
  domain-checker -f examples/domains.example.txt -o results.json
  domain-checker myapp --json
`;

// ─── Argument parser ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    names:      [],
    extensions: ['.com', '.io', '.app', '.org'],
    file:       null,
    output:     null,
    delay:      350,
    json:       false,
    quiet:      false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '-h': case '--help':
        console.log(HELP);
        process.exit(0);
        break;

      case '-v': case '--version': {
        const pkgPath = path.join(__dirname, 'package.json');
        const version = fs.existsSync(pkgPath)
          ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
          : 'unknown';
        console.log(version);
        process.exit(0);
        break;
      }

      case '-e': case '--extensions':
        if (!next) die('--extensions requires a value');
        opts.extensions = next.split(',').map(e => e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`);
        i++;
        break;

      case '-f': case '--file':
        if (!next) die('--file requires a path');
        opts.file = next;
        i++;
        break;

      case '-o': case '--output':
        if (!next) die('--output requires a path');
        opts.output = next;
        i++;
        break;

      case '-d': case '--delay':
        if (!next) die('--delay requires a value');
        opts.delay = parseInt(next, 10);
        if (isNaN(opts.delay)) die('--delay must be a number');
        i++;
        break;

      case '--json':
        opts.json = true;
        break;

      case '-q': case '--quiet':
        opts.quiet = true;
        break;

      default:
        if (arg.startsWith('-')) die(`Unknown option: ${arg}`);
        opts.names.push(arg);
    }
  }

  // Load names from file
  if (opts.file) {
    if (!fs.existsSync(opts.file)) die(`File not found: ${opts.file}`);
    const lines = fs.readFileSync(opts.file, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    opts.names = [...opts.names, ...lines];
  }

  return opts;
}

function die(msg) {
  console.error(`\n  ${c.red('Error:')} ${msg}\n`);
  process.exit(1);
}

// ─── Domain check logic ───────────────────────────────────────────────────

/**
 * Returns { domain, available: true | false | null, method }
 *   true  → likely available
 *   false → taken
 *   null  → could not determine (check manually)
 */
async function checkDomain(fullDomain) {
  // Step 1 — DNS: if the domain resolves → it is taken
  const dnsTypes = ['A', 'NS', 'MX'];
  for (const type of dnsTypes) {
    try {
      await dns.resolve(fullDomain, type);
      return { domain: fullDomain, available: false, method: `dns:${type}` };
    } catch (_) {}
  }

  // Step 2 — whois (requires the `whois` CLI, pre-installed on macOS/Linux)
  try {
    const raw = execSync(`whois "${fullDomain}" 2>/dev/null`, {
      timeout: 8000,
      encoding: 'utf8',
    });
    const out = raw.toLowerCase();
    const domainKey = fullDomain.toLowerCase();

    // Explicit domain record found → taken
    const hasDomainRecord =
      out.includes(`domain name: ${domainKey}`) ||
      out.includes(`domain: ${domainKey}`);
    if (hasDomainRecord) return { domain: fullDomain, available: false, method: 'whois:record' };

    // Signals that strongly indicate availability
    const freeSignals = [
      'no match for', 'not found', 'no data found',
      'no entries found', 'status: free', 'is available', 'domain not found',
    ];
    // Signals that strongly indicate the domain is registered
    const takenSignals = ['registrar:', 'creation date:', 'created:'];

    for (const s of freeSignals)  if (out.includes(s)) return { domain: fullDomain, available: true,  method: 'whois:free' };
    for (const s of takenSignals) if (out.includes(s)) return { domain: fullDomain, available: false, method: 'whois:registrar' };

    // DNS clean + whois returned no registrar info (common for .app/.io TLDs)
    // → treat as available but flag the method for transparency
    return { domain: fullDomain, available: true, method: 'dns-clean+whois-tld' };
  } catch (_) {
    return { domain: fullDomain, available: null, method: 'timeout' };
  }
}

// ─── Output helpers ───────────────────────────────────────────────────────

function saveOutput(results, outputPath) {
  const ext = path.extname(outputPath).toLowerCase();
  let content;

  if (ext === '.csv') {
    const rows = [
      'domain,available,method',
      ...results.map(r => `${r.domain},${r.available},${r.method}`),
    ];
    content = rows.join('\n') + '\n';
  } else {
    content = JSON.stringify(results, null, 2) + '\n';
  }

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(c.dim(`\nResults saved → ${outputPath}`));
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.names.length === 0) {
    console.log(HELP);
    process.exit(1);
  }

  const uniqueNames = [...new Set(opts.names)];
  const total = uniqueNames.length * opts.extensions.length;
  const COL = 30; // column width for domain name

  if (!opts.json) {
    console.log(
      `\n${c.bold('Domain Checker')}  ${c.dim(`DNS + whois · ${total} domain(s)`)}\n`
    );
  }

  const results = [];

  for (const name of uniqueNames) {
    for (const ext of opts.extensions) {
      const full = `${name}${ext}`;

      if (!opts.json && !opts.quiet) {
        process.stdout.write(`  ${full.padEnd(COL)}`);
      }

      const result = await checkDomain(full);
      results.push(result);

      if (!opts.json) {
        const label = full.padEnd(COL);
        if (result.available === true) {
          const line = `  ${label}${c.green('✓  available')}`;
          opts.quiet ? console.log(line) : process.stdout.write(`\r${line}\n`);
        } else if (result.available === false) {
          if (!opts.quiet) console.log(c.dim(`✗  taken`) + c.dim(`  (${result.method})`));
        } else {
          if (!opts.quiet) console.log(c.yellow('?  check manually'));
        }
      }

      await new Promise(r => setTimeout(r, opts.delay));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    if (opts.output) saveOutput(results, opts.output);
    return;
  }

  const available = results.filter(r => r.available === true);
  const manual    = results.filter(r => r.available === null);
  const taken     = results.filter(r => r.available === false);

  console.log('\n' + '─'.repeat(50));

  console.log(`\n${c.green(`Available (${available.length})`)}`);
  available.length
    ? available.forEach(r => console.log(`  ${c.green(r.domain)}`))
    : console.log(c.dim('  none'));

  if (manual.length) {
    console.log(`\n${c.yellow(`Check manually (${manual.length})`)}`);
    manual.forEach(r => console.log(`  ${c.yellow(r.domain)}`));
  }

  console.log(`\n${c.dim(`Taken: ${taken.length}`)}`);
  console.log('\n' + '─'.repeat(50));
  console.log(c.dim('\nTip: Always confirm on namecheap.com or porkbun.com before purchasing.\n'));

  if (opts.output) saveOutput(results, opts.output);
}

main().catch(err => {
  console.error(`\n  ${c.red('Fatal:')} ${err.message}\n`);
  process.exit(1);
});
