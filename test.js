import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {
	whichCommand,
	whichCommandSync,
	whichCommandAll,
	whichCommandAllSync,
} from './index.js';

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';

// The command this test file is run with (`node`) is guaranteed to be an executable in `PATH`.
const knownCommand = 'node';

function temporaryDirectory(t) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'which-command-'));
	t.after(() => {
		fs.rmSync(directory, {recursive: true, force: true});
	});
	return directory;
}

function createExecutable(directory, name) {
	const filePath = path.join(directory, name);
	fs.writeFileSync(filePath, '#!/bin/sh\necho hi\n');
	fs.chmodSync(filePath, 0o755);
	return filePath;
}

test('finds a known command', async () => {
	const result = await whichCommand(knownCommand);
	assert.ok(path.isAbsolute(result), 'returns an absolute path');
	assert.match(result, /[\/\\]node(?:\.exe)?$/iv);
});

test('sync finds a known command', () => {
	const result = whichCommandSync(knownCommand);
	assert.ok(path.isAbsolute(result));
	assert.match(result, /[\/\\]node(?:\.exe)?$/iv);
});

test('async and sync return the same result', async () => {
	assert.equal(await whichCommand(knownCommand), whichCommandSync(knownCommand));
});

test('returns undefined for a command that does not exist', async () => {
	assert.equal(await whichCommand('definitely-not-a-real-command-9x7q'), undefined);
	assert.equal(whichCommandSync('definitely-not-a-real-command-9x7q'), undefined);
});

test('`whichCommandAll` returns an array of matches', async () => {
	const result = await whichCommandAll(knownCommand);
	assert.ok(Array.isArray(result));
	assert.ok(result.length > 0);
	assert.ok(result.every(item => path.isAbsolute(item) && /[\/\\]node(?:\.exe)?$/iv.test(item)));
});

test('`whichCommandAll` and `whichCommandAllSync` agree', async () => {
	assert.deepEqual(await whichCommandAll(knownCommand), whichCommandAllSync(knownCommand));
});

test('`whichCommandAll` returns an empty array when not found', async () => {
	assert.deepEqual(await whichCommandAll('definitely-not-a-real-command-9x7q'), []);
	assert.deepEqual(whichCommandAllSync('definitely-not-a-real-command-9x7q'), []);
});

test('throws a TypeError for invalid input', async () => {
	await assert.rejects(whichCommand(42), TypeError);
	await assert.rejects(whichCommand(''), TypeError);
	await assert.rejects(whichCommandAll(42), TypeError);
	await assert.rejects(whichCommandAll(''), TypeError);
	assert.throws(() => whichCommandSync(undefined), TypeError);
	assert.throws(() => whichCommandSync(''), TypeError);
	assert.throws(() => whichCommandAllSync(undefined), TypeError);
	assert.throws(() => whichCommandAllSync(''), TypeError);
});

test('does not throw or match for a command containing a null byte', async () => {
	const command = `foo${String.fromCodePoint(0)}bar`;
	assert.equal(whichCommandSync(command), undefined);
	assert.equal(await whichCommand(command), undefined);
	assert.deepEqual(whichCommandAllSync(command), []);
	assert.deepEqual(await whichCommandAll(command), []);
});

test('finds an executable via the `path` option', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	assert.equal(whichCommandSync('foo', {path: directory}), executable);
});

test('async finds an executable via the `path` option', {skip: isWindows}, async t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	assert.equal(await whichCommand('foo', {path: directory}), executable);
});

test('does not find a non-executable file', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	fs.writeFileSync(path.join(directory, 'foo'), 'echo hi\n'); // No executable bit.
	assert.equal(whichCommandSync('foo', {path: directory}), undefined);
});

test('async also rejects a non-executable file', {skip: isWindows}, async t => {
	const directory = temporaryDirectory(t);
	fs.writeFileSync(path.join(directory, 'foo'), 'echo hi\n'); // No executable bit.
	assert.equal(await whichCommand('foo', {path: directory}), undefined);
});

test('does not return a directory even if it has the executable bit set', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	fs.mkdirSync(path.join(directory, 'foo'), {mode: 0o755}); // Directory named like the command.
	assert.equal(whichCommandSync('foo', {path: directory}), undefined);
});

test('async also rejects a directory with the executable bit set', {skip: isWindows}, async t => {
	const directory = temporaryDirectory(t);
	fs.mkdirSync(path.join(directory, 'foo'), {mode: 0o755});
	assert.equal(await whichCommand('foo', {path: directory}), undefined);
});

test('finds a command whose name contains a dot but no separator', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo.sh');
	// On posix, `foo.sh` is a plain command name searched in `PATH`, not a path.
	assert.equal(whichCommandSync('foo.sh', {path: directory}), executable);
});

test('finds an executable in a directory whose name contains spaces', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const spaced = path.join(directory, 'my bin');
	fs.mkdirSync(spaced);
	const executable = createExecutable(spaced, 'foo');
	assert.equal(whichCommandSync('foo', {path: spaced}), executable);
});

test('ignores `pathExt` on posix', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	// `pathExt` is a Windows concept; on posix the command is matched verbatim.
	assert.equal(whichCommandSync('foo', {path: directory, pathExt: '.EXE'}), executable);
});

test('does not treat a backslash as a separator on posix', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	// A backslash is a valid filename character on posix, so this is searched in `PATH`, not resolved as a path.
	const executable = createExecutable(directory, String.raw`foo\bar`);
	assert.equal(whichCommandSync(String.raw`foo\bar`, {path: directory}), executable);
});

test('finds an executable by absolute path', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	assert.equal(whichCommandSync(executable), executable);
});

test('resolves a relative command against `cwd`', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	assert.equal(whichCommandSync('./foo', {cwd: directory}), executable);
});

test('async resolves a relative command against `cwd`', {skip: isWindows}, async t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	assert.equal(await whichCommand('./foo', {cwd: directory}), executable);
});

test('does not search `path` for a command containing a separator', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	createExecutable(directory, 'foo');
	const emptyDirectory = temporaryDirectory(t);
	// `./foo` is resolved against `cwd` only. It must not be found via a `path` entry, even one that contains `foo`.
	assert.equal(whichCommandSync('./foo', {cwd: emptyDirectory, path: directory}), undefined);
	assert.deepEqual(whichCommandAllSync('./foo', {cwd: emptyDirectory, path: directory}), []);
});

test('`path` entries are resolved against `cwd`', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	createExecutable(directory, 'foo');
	// Use the directory name as a relative `path` entry, resolved against the parent as `cwd`.
	const result = whichCommandSync('foo', {cwd: path.dirname(directory), path: path.basename(directory)});
	assert.equal(result, path.join(directory, 'foo'));
});

test('`whichCommand` returns the first match in `path` order', {skip: isWindows}, t => {
	const directoryA = temporaryDirectory(t);
	const directoryB = temporaryDirectory(t);
	const executableA = createExecutable(directoryA, 'foo');
	createExecutable(directoryB, 'foo');
	const searchPath = [directoryA, directoryB].join(path.delimiter);
	assert.equal(whichCommandSync('foo', {path: searchPath}), executableA);
});

test('async `whichCommand` returns the first match in `path` order', {skip: isWindows}, async t => {
	const directoryA = temporaryDirectory(t);
	const directoryB = temporaryDirectory(t);
	const executableA = createExecutable(directoryA, 'foo');
	createExecutable(directoryB, 'foo');
	const searchPath = [directoryA, directoryB].join(path.delimiter);
	assert.equal(await whichCommand('foo', {path: searchPath}), executableA);
});

test('`whichCommandAll` returns all matches in `path` order and deduplicates', {skip: isWindows}, async t => {
	const directoryA = temporaryDirectory(t);
	const directoryB = temporaryDirectory(t);
	const executableA = createExecutable(directoryA, 'foo');
	const executableB = createExecutable(directoryB, 'foo');

	// Duplicate the first directory to ensure deduplication.
	const searchPath = [directoryA, directoryB, directoryA].join(path.delimiter);
	assert.deepEqual(whichCommandAllSync('foo', {path: searchPath}), [executableA, executableB]);
	assert.deepEqual(await whichCommandAll('foo', {path: searchPath}), [executableA, executableB]);
});

test('ignores empty `path` entries', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	const searchPath = ['', directory, ''].join(path.delimiter);
	assert.equal(whichCommandSync('foo', {path: searchPath}), executable);
});

test('returns undefined when `path` is empty', () => {
	assert.equal(whichCommandSync('definitely-not-a-real-command-9x7q', {path: ''}), undefined);
});

test('treats an explicit `.` `path` entry as the current directory', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	// Unlike an empty entry, an explicit `.` is honored and resolves against `cwd`.
	assert.equal(whichCommandSync('foo', {cwd: directory, path: '.'}), executable);
});

test('does not treat a quoted-empty `path` entry as the current directory on posix', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	createExecutable(directory, 'foo');
	// On posix, a `""` entry is a literal directory name. It must not be unquoted to an empty string that would resolve to `cwd`.
	assert.equal(whichCommandSync('foo', {cwd: directory, path: '""'}), undefined);
});

test('resolves a command via PATHEXT on Windows', {skip: !isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = path.join(directory, 'foo.CMD');
	fs.writeFileSync(executable, '@echo off\r\n');
	// `foo` resolves to `foo.CMD` through the extension list.
	assert.equal(whichCommandSync('foo', {path: directory, pathExt: '.CMD'}), executable);
});

test('falls back to the default PATHEXT when the environment variable is empty on Windows', {skip: !isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = path.join(directory, 'foo.CMD');
	fs.writeFileSync(executable, '@echo off\r\n');

	const original = process.env.PATHEXT;
	process.env.PATHEXT = '';
	t.after(() => {
		if (original === undefined) {
			delete process.env.PATHEXT;
		} else {
			process.env.PATHEXT = original;
		}
	});

	// An empty `PATHEXT` must not disable lookup; `.CMD` is in the default extension list.
	assert.equal(whichCommandSync('foo', {path: directory}), executable);
});

test('skips a same-named non-executable and continues searching `path`', {skip: isWindows}, t => {
	const nonExecutableDirectory = temporaryDirectory(t);
	fs.writeFileSync(path.join(nonExecutableDirectory, 'foo'), 'echo hi\n'); // No executable bit.
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	const searchPath = [nonExecutableDirectory, directory].join(path.delimiter);
	// The non-executable `foo` must not stop the search or appear in the results.
	assert.equal(whichCommandSync('foo', {path: searchPath}), executable);
	assert.deepEqual(whichCommandAllSync('foo', {path: searchPath}), [executable]);
});

test('continues searching when an earlier `path` entry lacks the command', {skip: isWindows}, t => {
	const emptyDirectory = temporaryDirectory(t);
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	const searchPath = [emptyDirectory, directory].join(path.delimiter);
	assert.equal(whichCommandSync('foo', {path: searchPath}), executable);
});

test('follows a symlink to an executable and returns the symlink path', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const target = createExecutable(directory, 'real');
	const link = path.join(directory, 'link');
	fs.symlinkSync(target, link);
	assert.equal(whichCommandSync('link', {path: directory}), link);
});

test('does not return a symlink that points to a directory', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const target = path.join(directory, 'target-directory');
	fs.mkdirSync(target);
	fs.symlinkSync(target, path.join(directory, 'link'));
	// The symlink resolves to a directory, which is not a command.
	assert.equal(whichCommandSync('link', {path: directory}), undefined);
});

test('does not return a broken symlink', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	fs.symlinkSync(path.join(directory, 'missing-target'), path.join(directory, 'link'));
	assert.equal(whichCommandSync('link', {path: directory}), undefined);
});

test('returns undefined for an absolute path to a non-executable file', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const filePath = path.join(directory, 'data.txt');
	fs.writeFileSync(filePath, 'hello\n'); // Not executable.
	assert.equal(whichCommandSync(filePath), undefined);
});

test('normalizes the resolved path, collapsing `..` segments', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	// `sub` need not exist; `path.resolve` collapses `..` lexically.
	const messyPath = path.join(directory, 'sub', '..');
	const result = whichCommandSync('foo', {path: messyPath});
	assert.equal(result, executable);
	assert.ok(!result.includes('..'));
});

test('`whichCommandAll` with a direct path returns a single-element array', {skip: isWindows}, t => {
	const directory = temporaryDirectory(t);
	const executable = createExecutable(directory, 'foo');
	assert.deepEqual(whichCommandAllSync(executable), [executable]);
});

test('CLI prints the path and exits 0', async () => {
	const {stdout} = await execFileAsync(process.execPath, ['cli.js', knownCommand]);
	assert.match(stdout.trim(), /[\/\\]node(?:\.exe)?$/iv);
});

test('CLI exits 1 when a command is not found', async () => {
	await assert.rejects(
		execFileAsync(process.execPath, ['cli.js', 'definitely-not-a-real-command-9x7q']),
		error => error.code === 1,
	);
});

test('CLI `--silent` suppresses output but keeps the exit code', async () => {
	const {stdout} = await execFileAsync(process.execPath, ['cli.js', '--silent', knownCommand]);
	assert.equal(stdout.trim(), '');

	await assert.rejects(
		execFileAsync(process.execPath, ['cli.js', '--silent', 'definitely-not-a-real-command-9x7q']),
		error => error.code === 1,
	);
});

test('CLI `--all` lists all matches', async () => {
	const {stdout} = await execFileAsync(process.execPath, ['cli.js', '--all', knownCommand]);
	const lines = stdout.trim().split('\n');
	assert.ok(lines.length > 0);
	assert.ok(lines.every(line => path.isAbsolute(line) && /[\/\\]node(?:\.exe)?$/iv.test(line)));
});

test('CLI prints a path for each command and exits 0 when all are found', async () => {
	const {stdout} = await execFileAsync(process.execPath, ['cli.js', knownCommand, knownCommand]);
	const lines = stdout.trim().split('\n');
	assert.equal(lines.length, 2);
	assert.ok(lines.every(line => /[\/\\]node(?:\.exe)?$/iv.test(line)));
});

test('CLI shows usage and exits 1 with no arguments', async () => {
	await assert.rejects(
		execFileAsync(process.execPath, ['cli.js']),
		error => error.code === 1 && /Usage/v.test(error.stderr),
	);
});

test('CLI `--version` prints the version', async () => {
	const {stdout} = await execFileAsync(process.execPath, ['cli.js', '--version']);
	assert.match(stdout.trim(), /^\d+\.\d+\.\d+/v);
});

test('CLI errors on an unknown flag', async () => {
	await assert.rejects(
		execFileAsync(process.execPath, ['cli.js', '--nope', knownCommand]),
		error => error.code === 1,
	);
});

test('CLI prints found commands but exits 1 when some are missing', async () => {
	await assert.rejects(
		execFileAsync(process.execPath, ['cli.js', knownCommand, 'definitely-not-a-real-command-9x7q']),
		error => error.code === 1 && /[\/\\]node(?:\.exe)?/iv.test(error.stdout),
	);
});

test('CLI treats arguments after `--` as commands, not flags', async () => {
	// With `--`, `--silent` becomes a (missing) command rather than a flag, so `node` is still printed and the exit code is 1.
	await assert.rejects(
		execFileAsync(process.execPath, ['cli.js', '--', '--silent', knownCommand]),
		error => error.code === 1 && /[\/\\]node(?:\.exe)?/iv.test(error.stdout),
	);
});
