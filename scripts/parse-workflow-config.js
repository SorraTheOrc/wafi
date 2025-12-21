#!/usr/bin/env node
/**
 * Parse workflow agents YAML config and output JSON for bash consumption.
 *
 * Usage:
 *   parse-workflow-config.js [config_path]
 *   parse-workflow-config.js --defaults
 *
 * If config_path is omitted, uses WORKFLOW_AGENTS_CONFIG env var or
 * falls back to config/workflow_agents.yaml relative to repo root.
 *
 * Output:
 *   JSON array of agent objects, each with normalized fields:
 *   - name: string (required)
 *   - label: string (display name)
 *   - role: string (waif startWork role)
 *   - worktree: bool
 *   - env: dict of env vars
 *   - idle: dict with task, frequency, variance (or null)
 *   - is_user: bool
 *
 * Exit codes:
 *   0 - success
 *   1 - config file not found (prints empty array or defaults)
 *   2 - YAML parse error or validation error
 */

import { parse as parseYaml } from 'yaml';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// Default agents matching current start-workflow-tmux.sh behavior
const DEFAULT_AGENTS = [
  {
    name: 'pm',
    label: 'PM agent',
    role: 'pm',
    worktree: true,
    env: { BD_ACTOR: 'pm' },
    idle: { task: 'clear; waif in-progress', frequency: 30, variance: 10 },
    is_user: false,
  },
  {
    name: 'design',
    label: 'Design agent',
    role: 'design',
    worktree: true,
    env: { BD_ACTOR: 'design' },
    idle: null,
    is_user: false,
  },
  {
    name: 'build',
    label: 'Build agent',
    role: 'build',
    worktree: true,
    env: { BD_ACTOR: 'build' },
    idle: null,
    is_user: false,
  },
  {
    name: 'docs',
    label: 'Doc agent',
    role: 'docs',
    worktree: true,
    env: { BD_ACTOR: 'docs' },
    idle: null,
    is_user: false,
  },
  {
    name: 'review',
    label: 'Review agent',
    role: 'review',
    worktree: true,
    env: { BD_ACTOR: 'review' },
    idle: null,
    is_user: false,
  },
  {
    name: 'user',
    label: 'User',
    role: null,
    worktree: false,
    env: {},
    idle: null,
    is_user: true,
  },
];

/**
 * Find git repo root by running git command
 */
function findRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Determine config file path.
 * Priority: explicit arg > WORKFLOW_AGENTS_CONFIG env > default location.
 * Returns null if file doesn't exist.
 */
function findConfigPath(explicitPath) {
  if (explicitPath) {
    return existsSync(explicitPath) ? explicitPath : null;
  }

  const envPath = process.env.WORKFLOW_AGENTS_CONFIG;
  if (envPath) {
    return existsSync(envPath) ? envPath : null;
  }

  const repoRoot = findRepoRoot();
  const defaultPath = join(repoRoot, 'config', 'workflow_agents.yaml');
  return existsSync(defaultPath) ? defaultPath : null;
}

/**
 * Validate a single agent entry. Returns list of error messages.
 */
function validateAgent(agent, index) {
  const errors = [];

  if (typeof agent !== 'object' || agent === null) {
    errors.push(`Agent ${index}: must be an object`);
    return errors;
  }

  if (!('name' in agent)) {
    errors.push(`Agent ${index}: missing required field 'name'`);
  } else if (typeof agent.name !== 'string' || !agent.name.trim()) {
    errors.push(`Agent ${index}: 'name' must be a non-empty string`);
  }

  const name = agent.name || '?';

  if ('label' in agent && typeof agent.label !== 'string') {
    errors.push(`Agent ${index} (${name}): 'label' must be a string`);
  }

  if ('role' in agent && agent.role !== null && typeof agent.role !== 'string') {
    errors.push(`Agent ${index} (${name}): 'role' must be a string or null`);
  }

  if ('worktree' in agent && typeof agent.worktree !== 'boolean') {
    errors.push(`Agent ${index} (${name}): 'worktree' must be a boolean`);
  }

  if ('env' in agent) {
    const env = agent.env;
    if (typeof env !== 'object' || env === null || Array.isArray(env)) {
      errors.push(`Agent ${index} (${name}): 'env' must be an object`);
    } else {
      for (const [k, v] of Object.entries(env)) {
        if (typeof k !== 'string' || !['string', 'number', 'boolean'].includes(typeof v)) {
          errors.push(`Agent ${index} (${name}): 'env' values must be strings or primitives`);
          break;
        }
      }
    }
  }

  if ('idle' in agent && agent.idle !== null) {
    const idle = agent.idle;
    if (typeof idle !== 'object' || Array.isArray(idle)) {
      errors.push(`Agent ${index} (${name}): 'idle' must be an object`);
    } else {
      if (!('task' in idle)) {
        errors.push(`Agent ${index} (${name}): 'idle.task' is required when 'idle' is specified`);
      } else if (typeof idle.task !== 'string') {
        errors.push(`Agent ${index} (${name}): 'idle.task' must be a string`);
      }

      for (const field of ['frequency', 'variance']) {
        if (field in idle && typeof idle[field] !== 'number') {
          errors.push(`Agent ${index} (${name}): 'idle.${field}' must be a number`);
        }
      }
    }
  }

  if ('is_user' in agent && typeof agent.is_user !== 'boolean') {
    errors.push(`Agent ${index} (${name}): 'is_user' must be a boolean`);
  }

  return errors;
}

/**
 * Normalize agent object to have all expected fields with defaults.
 */
function normalizeAgent(agent) {
  const name = agent.name;
  const isUser = agent.is_user || false;

  // Default worktree: true for agents, false for user pane
  const defaultWorktree = !isUser;

  const normalized = {
    name,
    label: agent.label || name,
    role: isUser ? null : (agent.role || name),
    worktree: 'worktree' in agent ? agent.worktree : defaultWorktree,
    env: {},
    idle: null,
    is_user: isUser,
  };

  // Normalize env vars to strings
  if (agent.env) {
    for (const [k, v] of Object.entries(agent.env)) {
      normalized.env[String(k)] = String(v);
    }
  }

  // Normalize idle config
  if (agent.idle) {
    normalized.idle = {
      task: agent.idle.task,
      frequency: agent.idle.frequency ?? 30,
      variance: agent.idle.variance ?? 10,
    };
  }

  return normalized;
}

/**
 * Parse YAML config and return normalized agent list.
 */
function parseConfig(configPath) {
  let content;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch (e) {
    console.error(`Error: Could not read ${configPath}: ${e.message}`);
    process.exit(2);
  }

  let data;
  try {
    data = parseYaml(content);
  } catch (e) {
    console.error(`Error: Invalid YAML in ${configPath}: ${e.message}`);
    process.exit(2);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    console.error(`Error: Config must be a YAML object with 'agents' key`);
    process.exit(2);
  }

  if (!('agents' in data)) {
    console.error(`Error: Config missing required 'agents' key`);
    process.exit(2);
  }

  const agentsRaw = data.agents;
  if (!Array.isArray(agentsRaw)) {
    console.error(`Error: 'agents' must be a list`);
    process.exit(2);
  }

  if (agentsRaw.length === 0) {
    console.error(`Error: 'agents' list is empty`);
    process.exit(2);
  }

  // Validate all agents
  const allErrors = [];
  for (let i = 0; i < agentsRaw.length; i++) {
    allErrors.push(...validateAgent(agentsRaw[i], i));
  }

  if (allErrors.length > 0) {
    console.error('Error: Config validation failed:');
    for (const err of allErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(2);
  }

  // Check for duplicate names
  const names = agentsRaw.map(a => a.name);
  const seen = new Set();
  const duplicates = [];
  for (const name of names) {
    if (seen.has(name)) {
      duplicates.push(name);
    }
    seen.add(name);
  }

  if (duplicates.length > 0) {
    console.error(`Error: Duplicate agent names: ${duplicates.join(', ')}`);
    process.exit(2);
  }

  return agentsRaw.map(normalizeAgent);
}

function main() {
  const args = process.argv.slice(2);

  // Handle --defaults flag
  if (args.includes('--defaults')) {
    console.log(JSON.stringify(DEFAULT_AGENTS, null, 2));
    return;
  }

  // Get config path from arg or env/default
  const explicitPath = args[0] || null;
  const configPath = findConfigPath(explicitPath);

  if (configPath === null) {
    // Config not found - output defaults or error
    if (explicitPath || process.env.WORKFLOW_AGENTS_CONFIG) {
      // Explicitly specified path doesn't exist - that's an error
      const target = explicitPath || process.env.WORKFLOW_AGENTS_CONFIG;
      console.error(`Error: Config file not found: ${target}`);
      process.exit(1);
    }
    // Default path doesn't exist - use built-in defaults silently
    console.log(JSON.stringify(DEFAULT_AGENTS, null, 2));
    return;
  }

  const agents = parseConfig(configPath);
  console.log(JSON.stringify(agents, null, 2));
}

main();
