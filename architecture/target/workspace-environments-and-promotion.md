# Target Architecture: Workspace Environments And Workflow Promotion

- **Status**: Product and technical specification
- **Scope**: n8nac workspace environment model, explicit environment targeting, and workflow promotion between environments
- **Decision**: Replace direct instance targeting in the n8nac product model with workspace environments. Do not keep `--instance` as a product concept in this spec.

---

## 1. Executive Summary

n8n-as-code should introduce a workspace-level **Environment** abstraction.

An environment is a named workspace target composed of:

- a global n8n-manager instance;
- an n8n project for that instance;
- a dedicated physical sync folder;
- optional workflow settings such as `folderSync` and `customNodesPath`.

Users can create as many environments as they want in a workspace:

```text
Global instances, owned by n8n-manager:
- managedA
- managedB
- cloudA
- cloudB

Workspace environments, owned by n8nac:
- Dev     = managedA + project Personal + workflows/dev
- Staging = managedB + project Personal + workflows/staging
- Prod    = cloudA   + project CGI      + workflows/prod
```

The user pins one environment as the default working environment. Commands run against that pinned environment unless another environment is explicitly selected.

n8nac should also provide commands to exchange or promote workflows between environments.

The short-term architecture stays intentionally robust:

```text
1 environment = 1 instance + 1 project + 1 physical sync path
```

Promotion is explicit and controlled. It copies/applies a workflow from one environment scope to another, then pushes to the target environment. It is not a magical multi-environment sync folder.

---

## 2. Product Specification

### 2.1 User Mental Model

The user should think in terms of **environments**, not raw instances.

A raw instance is incomplete for workflow work because it does not include:

- which n8n project to use;
- where local workflow files live;
- which `.n8n-state.json` belongs to that remote target;
- which remote workflow IDs apply;
- which credentials are available;
- which conflict state applies.

An environment bundles these pieces into a coherent workspace target.

### 2.2 Product Promise

n8n-as-code lets users:

- register multiple n8n instances globally via n8n-manager;
- define workspace-specific environments that map to those instances and projects;
- choose a default environment for day-to-day work;
- run normal sync commands against any environment;
- promote workflows explicitly between environments.

### 2.3 Example Narrative

A user has three environments:

```text
Dev     -> local managed n8n, Personal project
Staging -> local managed n8n, Personal project
Prod    -> n8n Cloud, CGI project
```

The user works by default in Dev:

```bash
n8nac env pin Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/invoice-reminder.workflow.ts
```

When ready, the user promotes to Production:

```bash
n8nac promote workflows/dev/invoice-reminder.workflow.ts --from Dev --to Prod
```

The command copies/adapts the workflow into the Prod sync scope, pushes it to the Prod instance/project, and records Prod-specific sync state.

### 2.4 Product Principles

1. **Environment is the user-facing target**

Users deploy to `Prod`, not to `cloudA`.

2. **Instances remain global runtime/auth objects**

n8n-manager owns instances, API keys, Docker/runtime state, tunnels, and project discovery.

3. **Environments are workspace-local**

The same global instance may be used by multiple workspaces with different project/sync settings.

4. **Every environment has its own physical sync scope**

This avoids mixing workflow IDs, project IDs, state files, remote caches, and conflicts.

5. **Promotion is explicit**

Promotion is a deployment-like action between environments, not background sync.

6. **No mandatory dev/staging/prod pipeline**

Users may create any number of environments with arbitrary names.

7. **Multiple source-of-truth patterns are allowed**

A user may sync with Dev, Prod, or any environment. n8nac should not force one canonical source folder yet.

8. **The product vocabulary should not expose direct instance targeting in n8nac**

Direct instance selection is the wrong abstraction for workflow sync and deployment.

### 2.5 Non-Goals

- Do not introduce a mandatory “project/app/pipeline” abstraction above environments.
- Do not introduce a single canonical source folder in the first implementation.
- Do not pretend n8n has a native dev-to-prod merge model.
- Do not make credentials portable automatically.
- Do not make one sync folder target multiple environments.
- Do not keep `--instance` as part of the n8nac product model.

---

## 3. User-Facing UX

### 3.1 Environment Management

Preferred command group:

```bash
n8nac env list
n8nac env status
n8nac env add Dev --instance-id managedA --project-id personal --project-name Personal --sync-folder workflows/dev
n8nac env add Prod --instance-id cloudA --project-id cgi --project-name CGI --sync-folder workflows/prod
n8nac env pin Dev
n8nac env update Prod --project-id cgi --project-name CGI
n8nac env remove Staging
```

`environment` can be provided as a long alias for discoverability:

```bash
n8nac environment list
n8nac environment pin Prod
```

### 3.2 Running Commands Against An Environment

Default pinned environment:

```bash
n8nac env pin Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my.workflow.ts
```

One-off explicit environment:

```bash
n8nac --env Prod list
n8nac --env Prod verify <workflow-id>
n8nac --env Prod execution list --workflow-id <workflow-id> --json
```

### 3.3 Promotion

Minimal MVP command:

```bash
n8nac promote <source-workflow-path> --from Dev --to Prod
```

Example:

```bash
n8nac promote workflows/dev/invoice-reminder.workflow.ts --from Dev --to Prod
```

The command should:

1. resolve source environment;
2. resolve target environment;
3. validate that the source workflow path belongs to the source sync scope;
4. derive the target path under the target sync scope;
5. preserve target workflow ID if the target file already exists;
6. strip source-only remote identifiers when creating a new target workflow;
7. rewrite project metadata to target project;
8. write/update target local workflow file;
9. push target workflow to target remote;
10. update target sync state.

### 3.4 Later Promotion UX

Possible later additions:

```bash
n8nac promote <workflow-id-or-name> --from Dev --to Prod
n8nac promote <path> --to Prod
n8nac promote <path> --from Dev --to Prod --dry-run
n8nac promote <path> --from Dev --to Prod --no-push
n8nac promote <path> --from Dev --to Prod --overwrite
```

These should be deferred until the MVP behavior is safe and well-tested.

---

## 4. Current Architecture Mapping

### 4.1 Current Global Instance Ownership

Current code uses `@n8n-as-code/n8n-manager-core` through `ConfigService` and `manager-adapter`.

Relevant files:

- `packages/cli/src/services/config-service.ts`
- `packages/manager-adapter/src/index.ts`
- `node_modules/@n8n-as-code/n8n-manager-core/dist/configuration-service.d.ts`
- `node_modules/@n8n-as-code/n8n-manager-core/dist/configuration-service.js`

Current n8n-manager workspace override type:

```ts
export interface N8nWorkspaceOverrides {
    version: 3;
    activeInstanceId?: string;
    syncFolder?: string;
    projectId?: string;
    projectName?: string;
    folderSync?: boolean;
    customNodesPath?: string;
}
```

Current resolution in n8n-manager-core:

```ts
const requestedInstanceId = cleanString(input.instanceId);
const workspaceInstanceId = cleanString(workspace.activeInstanceId);
const globalInstanceId = cleanString(globalConfig.activeInstanceId);
const activeInstanceId = requestedInstanceId ?? workspaceInstanceId ?? globalInstanceId;
```

Current limitation:

- `instanceId` can be explicit;
- workspace project and sync settings are still global to the workspace;
- targeting a different instance does not carry a different workspace project/sync folder.

This is the main reason to introduce environments.

### 4.2 Current CLI Instance Targeting

Relevant file:

- `packages/cli/src/index.ts`

Current global option:

```ts
program.option('--instance <name>', 'Target a specific global n8n-manager instance by name instead of the effective one');
```

It is injected into process env:

```ts
process.env.N8NAC_INSTANCE_NAME = globalInstance;
```

Relevant file:

- `packages/cli/src/commands/base.ts`

`BaseCommand` reads:

```ts
const requestedInstanceName = process.env.N8NAC_INSTANCE_NAME?.trim() || undefined;
```

It resolves instance by name and sets:

```ts
this.activeInstanceId = match.id;
```

Current limitation:

- this targets an instance by name;
- it does not target an environment;
- it cannot safely represent per-target project/sync settings.

Specification decision:

- remove this from the n8nac product model;
- replace with `--env <name>` and environment resolution.

### 4.3 Current Workspace Commands

Relevant file:

- `packages/cli/src/index.ts`

Current commands:

```bash
n8nac workspace status
n8nac workspace pin-instance --instance-id <id>
n8nac workspace clear-instance
n8nac workspace set-sync-folder <path>
n8nac workspace clear-sync-folder
n8nac workspace set-project --project-id <id> --project-name <name>
n8nac workspace clear-project
```

These commands operate on workspace-level singleton fields.

Environment architecture changes the model from singleton fields to named environment entries.

New command group should become the main UX:

```bash
n8nac env ...
```

Workspace commands may still exist for other workspace concerns, but instance/project/sync targeting should move to `env`.

### 4.4 Current ConfigService Responsibilities

Relevant file:

- `packages/cli/src/services/config-service.ts`

Current methods directly impacted:

```ts
getLocalConfig()
getWorkspaceConfig()
listInstances()
getEffectiveInstanceConfig(instanceId?)
getEffectiveContext(instanceId?)
prepareWorkspaceContext(instanceId?)
getActiveInstanceId()
pinWorkspaceInstance(instanceId)
clearWorkspaceInstanceOverride()
setWorkspaceSyncFolder(syncFolder)
setWorkspaceProject(project)
clearWorkspaceProjectOverride()
resolveWorkspaceContext(instanceId?)
contextToInstanceProfile(context)
contextToLocalConfig(context)
buildWorkflowDir(syncFolder, instanceIdentifier, projectName)
```

Current important computed path:

```ts
workflowDir = path.join(syncFolder, instanceIdentifier, createProjectSlug(projectName))
```

Environment model should preserve the idea that final `workflowDir` is computed and not manually edited by users unless an explicit advanced override exists.

### 4.5 Current BaseCommand Flow

Relevant file:

- `packages/cli/src/commands/base.ts`

Current flow:

1. constructor creates `ConfigService`;
2. constructor resolves host/API key/sync folder from env or effective context;
3. runtime preparation happens lazily through `prepareRuntimeContext()`;
4. sync config is produced by `getSyncConfig()`;
5. sync commands construct `SyncManager(this.client, syncConfig)`.

Environment model should change `BaseCommand` from:

```ts
activeInstanceId?: string
```

to a richer target:

```ts
activeEnvironmentId?: string
activeEnvironmentName?: string
activeInstanceId?: string
```

`prepareRuntimeContext()` should prepare the selected environment, not only selected instance.

### 4.6 Current Sync State Isolation

Relevant files:

- `packages/cli/src/core/services/sync-manager.ts`
- `packages/cli/src/core/services/state-manager.ts`
- `packages/cli/src/core/services/sync-event-journal.ts`
- `packages/cli/src/core/services/workflow-state-tracker.ts`
- `packages/cli/src/core/services/sync-engine.ts`

Current `SyncManager.ensureInitialized()` computes instance directory:

```ts
const instanceDir = this.config.workflowDir
    ? path.normalize(this.config.workflowDir)
    : path.join(
        this.config.directory,
        this.config.instanceIdentifier || 'default',
        createProjectSlug(this.config.projectName),
    );
```

Inside `instanceDir`, the sync engine stores:

- workflow files;
- `.n8n-state.json`;
- `.n8n-sync-events.jsonl`;
- TypeScript stubs and `tsconfig.json`.

This already supports environment isolation if each environment resolves to a distinct `workflowDir`.

The environment feature should rely on this invariant rather than inventing new sync-state paths.

---

## 5. Proposed Data Model

### 5.1 Workspace Config Version

Introduce workspace config version 4.

Current v3:

```json
{
  "version": 3,
  "activeInstanceId": "test",
  "syncFolder": "workflows-test",
  "projectId": "project-test",
  "projectName": "Test Project"
}
```

Proposed v4:

```json
{
  "version": 4,
  "activeEnvironmentId": "dev",
  "environments": [
    {
      "id": "dev",
      "name": "Dev",
      "instanceId": "managedA",
      "projectId": "personal",
      "projectName": "Personal",
      "syncFolder": "workflows/dev"
    },
    {
      "id": "staging",
      "name": "Staging",
      "instanceId": "managedB",
      "projectId": "personal",
      "projectName": "Personal",
      "syncFolder": "workflows/staging"
    },
    {
      "id": "prod",
      "name": "Prod",
      "instanceId": "cloudA",
      "projectId": "cgi",
      "projectName": "CGI",
      "syncFolder": "workflows/prod"
    }
  ]
}
```

### 5.2 Why Array Instead Of Object Map

Use an array rather than an object map because it allows:

- stable machine ID and user-facing name;
- ordering in UI;
- future metadata per environment;
- easier rename without changing identity;
- duplicate-name validation with explicit errors.

### 5.3 TypeScript Interfaces

Add n8nac-side interfaces first:

```ts
export interface IN8nWorkspaceEnvironment {
    id: string;
    name: string;
    instanceId: string;
    projectId?: string;
    projectName?: string;
    syncFolder: string;
    folderSync?: boolean;
    customNodesPath?: string;
    description?: string;
}

export interface IWorkspaceConfigV4 {
    version: 4;
    activeEnvironmentId?: string;
    environments: IN8nWorkspaceEnvironment[];
}

export type IWorkspaceConfig = IWorkspaceConfigV3 | IWorkspaceConfigV4;
```

Current `IWorkspaceConfig` in `packages/cli/src/services/config-service.ts` is v3-only:

```ts
export interface IWorkspaceConfig extends ILocalConfig {
    version: 3;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
}
```

This needs to become a UI/effective snapshot type, not a direct persisted config type.

Recommended split:

```ts
export interface IPersistedWorkspaceConfigV3 extends ILocalConfig {
    version: 3;
    activeInstanceId?: string;
}

export interface IPersistedWorkspaceConfigV4 {
    version: 4;
    activeEnvironmentId?: string;
    environments: IN8nWorkspaceEnvironment[];
}

export interface IEffectiveWorkspaceSnapshot extends ILocalConfig {
    version: 4;
    activeEnvironmentId?: string;
    activeInstanceId?: string;
    activeEnvironment?: IN8nWorkspaceEnvironment;
    environments: IN8nWorkspaceEnvironment[];
    instances: IInstanceProfile[];
}
```

### 5.4 Environment Resolution Result

Add an explicit resolved environment context:

```ts
export interface IResolvedWorkspaceEnvironment extends ILocalConfig {
    environment: IN8nWorkspaceEnvironment;
    environmentId: string;
    environmentName: string;
    activeInstanceId: string;
    activeInstanceName: string;
    instance: IInstanceProfile;
    host: string;
    apiKey?: string;
    apiBaseUrl?: string;
    publicBaseUrl?: string;
    instanceIdentifier?: string;
    syncFolder: string;
    workflowDir?: string;
    projectId?: string;
    projectName?: string;
    folderSync: boolean;
    customNodesPath?: string;
    sources: {
        environment: 'explicit' | 'workspace-default' | 'legacy' | 'global-fallback';
        instance: 'environment';
        project: 'environment' | 'instance-default' | 'missing';
        syncFolder: 'environment';
    };
}
```

---

## 6. Configuration Ownership

### 6.1 Global Instance Store Remains In n8n-manager

No change in principle:

- global instance list;
- active global instance;
- API keys;
- runtime state;
- managed Docker lifecycle;
- tunnels;
- default project per instance.

### 6.2 Workspace Environments Live In n8nac Workspace Config

The workspace file remains `n8nac-config.json`, but schema becomes v4.

Important current technical constraint:

`ConfigService` currently delegates workspace config read/write to `N8nConfigurationService.readWorkspaceOverrides()` and `writeWorkspaceOverrides()` from `@n8n-as-code/n8n-manager-core`.

That service currently sanitizes workspace overrides to v3 fields. Therefore, implementation must choose one of two paths:

### Option A: Update `@n8n-as-code/n8n-manager-core` To Support v4 Environments

Pros:

- consistent read/write path across CLI, adapter, and VS Code;
- existing `manager-adapter` facade can expose v4 workspace data;
- less duplicate parsing logic.

Cons:

- requires coordinated release of n8n-manager-core;
- n8n-manager-core starts knowing about n8nac-specific environments.

### Option B: Move Environment Persistence Into n8nac `ConfigService`

Pros:

- keeps n8n-manager-core focused on global instance/runtime concerns;
- environments are clearly an n8nac workspace concern;
- faster implementation inside this repo.

Cons:

- `ConfigService` must parse/write `n8nac-config.json` directly for v4;
- `manager-adapter` and VS Code code paths need alignment;
- two services may touch the same config file unless carefully separated.

Recommended approach:

- Implement n8nac-side parsing/writing for v4 environments in `ConfigService`.
- Continue using `N8nConfigurationService` for global instance list, secrets, runtime preparation, and v3 fallback resolution.
- Update `manager-adapter` only where VS Code needs environment snapshots.
- Later decide whether to upstream generic v4 awareness to n8n-manager-core.

Reason:

Environments are a workspace/product concept of n8nac. n8n-manager should not be forced to own workflow sync topology.

---

## 7. Resolution Semantics

### 7.1 Resolution Order

When a command needs an effective target:

1. explicit `--env <name-or-id>`;
2. workspace `activeEnvironmentId`;
3. if no v4 environments exist, v3 legacy fields as an implicit environment;
4. global active instance fallback only for generation-light commands that do not require sync;
5. otherwise fail with actionable setup guidance.

### 7.2 Explicit Environment Lookup

Environment names should be resolved by:

1. exact `id` match;
2. exact case-insensitive `name` match;
3. fail if no match;
4. fail if name is ambiguous.

Because v4 uses unique IDs, ambiguity should only be possible if duplicate names are allowed. Prefer enforcing unique names too.

### 7.3 Project Resolution

For an environment:

```ts
projectId = environment.projectId ?? instance.defaultProject?.id
projectName = environment.projectName ?? instance.defaultProject?.name
```

For sync commands, missing project should remain an error unless the instance is a self-hosted n8n without projects API and user explicitly uses `personal`.

Current error in `BaseCommand.getSyncConfig()`:

```ts
Missing required project configuration: projectId, projectName, syncFolder.
```

This should become environment-aware:

```text
Environment "Prod" is missing project configuration.
Set it with:
  n8nac env update Prod --project-id <id> --project-name <name>
```

### 7.4 Sync Folder Resolution

Environment sync folder is required.

It should be resolved relative to workspace root unless absolute:

```ts
syncFolder = path.isAbsolute(env.syncFolder)
    ? env.syncFolder
    : path.resolve(workspaceRoot, env.syncFolder)
```

Final workflow directory remains computed using instance identity and project slug:

```ts
workflowDir = path.join(
    resolvedSyncFolder,
    instanceIdentifier,
    createProjectSlug(projectName),
)
```

This preserves current isolation behavior and gives each environment a physical sync scope.

Example:

```text
workflows/dev/n8n_f85ac825d1/personal/
workflows/prod/n8n_1bfdd27c80/cgi/
```

### 7.5 Instance Identifier

Current `ConfigService` only exposes canonical identifiers:

```ts
private canonicalInstanceIdentifier(identifier?: string): string | undefined {
    return isCanonicalUserInstanceIdentifier(identifier) ? identifier : undefined;
}
```

For environments, the instance identifier still belongs to the global instance, not the environment.

If missing, existing `getOrCreateInstanceIdentifier(host, instanceId)` behavior can remain, but called with the environment’s instance ID.

---

## 8. CLI Design

### 8.1 Global Option

Add:

```ts
program.option('--env <name>', 'Target a workspace environment by name or ID');
```

Do not include direct instance targeting in the product UX.

Implementation can initially mirror the current env-var bridge pattern for minimal churn:

```ts
process.env.N8NAC_ENVIRONMENT = selectedEnv;
```

But preferred medium-term implementation is passing command context explicitly rather than using process env.

### 8.2 Top-Level Command Parsing Impact

Current helper `getFirstPositionalToken()` skips `--instance`:

```ts
if (token === '--instance') {
    index += 1;
    continue;
}

if (token.startsWith('--instance=')) {
    continue;
}
```

Update it to skip `--env`:

```ts
if (token === '--env' || token === '--environment') {
    index += 1;
    continue;
}

if (token.startsWith('--env=') || token.startsWith('--environment=')) {
    continue;
}
```

This matters for lazy `skills` help behavior and global option parsing.

### 8.3 New Commands

Add command group in `packages/cli/src/index.ts` or a new command module.

Recommended module:

```text
packages/cli/src/commands/environment.ts
```

Methods:

```ts
class EnvironmentCommand {
    list(options: { json?: boolean }): void;
    status(options: { json?: boolean }): void;
    add(name: string, options: AddEnvironmentOptions): void;
    update(nameOrId: string, options: UpdateEnvironmentOptions): void;
    pin(nameOrId: string, options: { json?: boolean }): void;
    remove(nameOrId: string, options: { json?: boolean; force?: boolean }): void;
}
```

CLI shape:

```bash
n8nac env list [--json]
n8nac env status [--json]
n8nac env add <name> --instance-id <id> --project-id <id> --project-name <name> --sync-folder <path> [--json]
n8nac env update <name-or-id> [--instance-id <id>] [--project-id <id>] [--project-name <name>] [--sync-folder <path>] [--json]
n8nac env pin <name-or-id> [--json]
n8nac env remove <name-or-id> [--force] [--json]
```

### 8.4 Command Output

`n8nac env list` should show:

```text
Active  Environment  Instance      Project   Sync Folder
*       Dev          managedA      Personal  workflows/dev
        Staging      managedB      Personal  workflows/staging
        Prod         cloudA        CGI       workflows/prod
```

JSON output should include resolved instance display info:

```json
{
  "activeEnvironmentId": "dev",
  "environments": [
    {
      "id": "dev",
      "name": "Dev",
      "instanceId": "managedA",
      "instanceName": "Local Dev",
      "projectId": "personal",
      "projectName": "Personal",
      "syncFolder": "workflows/dev",
      "workflowDir": "/repo/workflows/dev/n8n_xxx/personal"
    }
  ]
}
```

### 8.5 Existing Workspace Commands

Current commands that set singleton targeting become conceptually obsolete:

```bash
n8nac workspace pin-instance
n8nac workspace clear-instance
n8nac workspace set-project
n8nac workspace clear-project
n8nac workspace set-sync-folder
n8nac workspace clear-sync-folder
```

Recommended product direction:

- `workspace status` can remain but should show environment-aware status;
- new setup flows should use `env` commands;
- docs and agent guidance should move to `env`.

This spec does not require preserving direct instance targeting behavior.

---

## 9. ConfigService Technical Changes

### 9.1 New Methods

In `packages/cli/src/services/config-service.ts`, add:

```ts
getPersistedWorkspaceConfig(): IPersistedWorkspaceConfigV3 | IPersistedWorkspaceConfigV4;
getEnvironmentConfig(): IWorkspaceConfigV4;
listEnvironments(): IN8nWorkspaceEnvironment[];
getActiveEnvironmentId(): string | undefined;
resolveEnvironment(environmentNameOrId?: string): IResolvedWorkspaceEnvironment;
prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment>;
addEnvironment(input: AddEnvironmentInput): IN8nWorkspaceEnvironment;
updateEnvironment(nameOrId: string, patch: UpdateEnvironmentInput): IN8nWorkspaceEnvironment;
pinEnvironment(nameOrId: string): IN8nWorkspaceEnvironment;
removeEnvironment(nameOrId: string): IN8nWorkspaceEnvironment;
```

### 9.2 Methods To Refactor

Current methods should become environment-aware:

```ts
getLocalConfig(environmentNameOrId?: string)
getWorkspaceConfig()
getEffectiveInstanceConfig(instanceId?)
getEffectiveContext(instanceId?)
prepareWorkspaceContext(instanceId?)
getActiveInstanceId()
```

Recommended approach:

- keep method names temporarily if heavily used internally;
- internally route them through `resolveEnvironment()` where appropriate;
- introduce new clearer methods for new code.

Example:

```ts
getLocalConfig(environmentNameOrId?: string): Partial<ILocalConfig> {
    try {
        return this.environmentToLocalConfig(this.resolveEnvironment(environmentNameOrId));
    } catch {
        return {};
    }
}
```

### 9.3 Writing Workspace Config

Add private methods:

```ts
private readN8nacWorkspaceConfig(): IPersistedWorkspaceConfigV3 | IPersistedWorkspaceConfigV4;
private writeN8nacWorkspaceConfig(config: IPersistedWorkspaceConfigV4): void;
private getWorkspaceConfigPath(): string;
private normalizeEnvironmentInput(input: AddEnvironmentInput): IN8nWorkspaceEnvironment;
private slugEnvironmentId(name: string): string;
private assertUniqueEnvironment(id: string, name: string, existing?: string): void;
```

Current `getInstanceConfigPath()` delegates to n8n-manager-core:

```ts
return this.manager.getWorkspaceConfigPath(this.workspaceRoot);
```

This can still be used for path resolution, but not for v4 serialization if manager-core strips unknown fields.

### 9.4 v3 Compatibility As Migration Input

Even if `--instance` is not retained, existing workspace configs may exist. v3 config should be interpreted as an implicit environment until the user writes v4.

Implicit environment shape:

```ts
{
    id: 'default',
    name: 'Default',
    instanceId: v3.activeInstanceId ?? global.activeInstanceId,
    projectId: v3.projectId,
    projectName: v3.projectName,
    syncFolder: v3.syncFolder ?? 'workflows',
    folderSync: v3.folderSync,
    customNodesPath: v3.customNodesPath,
}
```

When the user runs `n8nac env add`, `env update`, or `env pin`, write v4.

Do not automatically rewrite user files on read.

### 9.5 Environment Preparation And Runtime

Current `prepareWorkspaceContext(instanceId?)` calls:

```ts
this.runtime.prepareEffectiveContext({
    workspaceRoot: this.workspaceRoot,
    instanceId,
    syncFolderDefault: 'workspace',
    consumer: 'cli',
    autoStart: true,
});
```

New logic:

1. resolve environment to instance ID;
2. call runtime prepare with `instanceId: env.instanceId` to auto-start/prepare that instance;
3. ignore workspace singleton project/sync fields from manager-core for v4;
4. overlay environment project/sync fields in n8nac.

Pseudo-code:

```ts
async prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment> {
    const resolved = this.resolveEnvironment(environmentNameOrId);
    const prepared = await this.runtime.prepareEffectiveContext({
        workspaceRoot: this.workspaceRoot,
        instanceId: resolved.environment.instanceId,
        syncFolderDefault: 'workspace',
        consumer: 'cli',
        autoStart: true,
    });

    if (prepared.runtime.blocked) {
        throw new Error(prepared.runtime.blocked.message);
    }

    return this.mergePreparedRuntimeWithEnvironment(prepared.context, resolved.environment);
}
```

---

## 10. BaseCommand Technical Changes

### 10.1 Current Problem

`BaseCommand` currently knows about `activeInstanceId` and `N8NAC_INSTANCE_NAME`.

This should become selected environment context.

### 10.2 New Fields

```ts
protected activeEnvironmentId?: string;
protected activeEnvironmentName?: string;
protected activeInstanceId?: string;
protected instanceIdentifier: string | null = null;
```

### 10.3 Constructor Behavior

Current constructor performs a lot of resolution immediately. With environments, prefer this flow:

1. create `ConfigService`;
2. read explicit environment from `process.env.N8NAC_ENVIRONMENT` or constructor options;
3. resolve lightweight environment if possible;
4. initialize `N8nApiClient` with host/apiKey if immediately available;
5. defer full runtime prep to `prepareRuntimeContext()`.

### 10.4 `prepareRuntimeContext()`

Current:

```ts
const context = await this.configService.prepareWorkspaceContext(this.activeInstanceId);
```

New:

```ts
const context = await this.configService.prepareEnvironment(this.activeEnvironmentIdOrName);
```

Then set:

```ts
this.activeEnvironmentId = context.environmentId;
this.activeEnvironmentName = context.environmentName;
this.activeInstanceId = context.activeInstanceId;
this.client = new N8nApiClient({ host: context.host, apiKey: context.apiKey });
this.config = {
    ...this.config,
    directory: this.configService.resolveWorkspacePath(context.syncFolder || './workflows'),
    host: context.host,
    apiKeyConfigured: true,
    folderSync: context.folderSync ?? false,
};
```

### 10.5 `getSyncConfig()`

Current sync config includes:

```ts
{
    directory: this.config.directory,
    workflowDir: localConfig.workflowDir ? ... : undefined,
    instanceIdentifier,
    instanceConfigPath,
    projectId,
    projectName,
    folderSync,
}
```

New sync config should include environment metadata too:

```ts
{
    directory: context.syncFolder,
    workflowDir: context.workflowDir,
    instanceIdentifier: context.instanceIdentifier,
    instanceConfigPath: this.configService.getInstanceConfigPath(),
    projectId: context.projectId,
    projectName: context.projectName,
    folderSync: context.folderSync ?? false,
    environmentId: context.environmentId,
    environmentName: context.environmentName,
}
```

Update `ISyncConfig` in `packages/cli/src/core/types.ts` accordingly.

---

## 11. Sync Engine Implications

### 11.1 Existing Design Mostly Works

Because `SyncManager` stores all state under `instanceDir`, environment isolation works if `workflowDir` differs per environment.

No major changes required in:

- `StateManager`;
- `SyncEventJournal`;
- `WorkflowStateTracker`;
- `SyncEngine`.

### 11.2 Required Sync Config Metadata

Add environment metadata for logging/debugging/UI:

```ts
interface ISyncConfig {
    directory: string;
    workflowDir?: string;
    instanceIdentifier?: string;
    instanceConfigPath?: string;
    projectId?: string;
    projectName?: string;
    folderSync?: boolean;
    environmentId?: string;
    environmentName?: string;
}
```

### 11.3 State Isolation Invariant

The following files must be environment-specific because they live in `workflowDir`:

```text
.n8n-state.json
.n8n-sync-events.jsonl
.workflow.ts files
.trash/
tsconfig.json
n8n-workflows.d.ts
```

Test this explicitly.

---

## 12. Promotion Command Technical Design

### 12.1 New Command Module

Add:

```text
packages/cli/src/commands/promote.ts
```

Class:

```ts
export class PromoteCommand {
    constructor(private readonly configService = new ConfigService()) {}

    async run(sourcePath: string, options: PromoteOptions): Promise<void>;
}
```

Options:

```ts
interface PromoteOptions {
    from: string;
    to: string;
    dryRun?: boolean;
    noPush?: boolean;
    json?: boolean;
}
```

### 12.2 MVP Input Contract

For MVP, require a source path.

```bash
n8nac promote workflows/dev/my.workflow.ts --from Dev --to Prod
```

Do not initially support workflow ID or fuzzy name. That can be added later after logical identity is solved.

### 12.3 Promotion Algorithm

1. Resolve source environment.
2. Resolve target environment.
3. Ensure source and target environment IDs differ.
4. Resolve source workflow path.
5. Assert source path is inside source `workflowDir`.
6. Read/parse source workflow using existing transformer/compiler utilities where possible.
7. Compute target relative path from source path relative to source `workflowDir`.
8. Resolve target file path under target `workflowDir`.
9. If target file exists, read target workflow metadata and preserve target workflow ID.
10. If target file does not exist, strip source remote workflow ID so push creates a new remote workflow.
11. Rewrite project metadata to target environment’s `projectId/projectName`.
12. Write target file.
13. If `--no-push`, stop after file creation and report next command.
14. Otherwise run push using target environment context.
15. Report source env, target env, target file, and target remote workflow ID.

### 12.4 ID Handling

Current workflow files can contain n8n remote IDs in workflow metadata.

Promotion must not blindly carry Dev workflow ID to Prod.

Rules:

- If target file exists and has an ID, preserve target ID.
- If target file does not exist, remove ID before first target push.
- If target file exists but remote target workflow is missing, existing sync logic can recreate or fail depending on current `push` semantics.

### 12.5 Target Matching MVP

MVP matching uses relative path only.

Example:

```text
Source workflowDir: workflows/dev/n8n_dev/personal
Source path:        workflows/dev/n8n_dev/personal/invoice.workflow.ts
Relative path:      invoice.workflow.ts
Target workflowDir: workflows/prod/n8n_prod/cgi
Target path:        workflows/prod/n8n_prod/cgi/invoice.workflow.ts
```

This is predictable and avoids introducing logical deployment keys too early.

### 12.6 Future Logical Identity

Future enhancement:

```ts
@workflow({
    name: 'Invoice Reminder',
    deploymentKey: 'invoice-reminder'
})
```

Deployment state could map:

```json
{
  "invoice-reminder": {
    "dev": "dev-workflow-id",
    "prod": "prod-workflow-id"
  }
}
```

Do not include this in MVP.

### 12.7 Credential Handling

Promotion should warn, not solve credentials automatically.

After writing/pushing target workflow, suggest:

```bash
n8nac --env Prod workflow credential-required <workflow-id>
```

Optional future:

```bash
n8nac promote ... --check-credentials
n8nac promote ... --ensure-credentials
```

---

## 13. VS Code Extension Impact

Relevant files:

- `packages/vscode-extension/src/services/n8n-configuration-controller.ts`
- `packages/vscode-extension/src/ui/configuration-webview.ts`
- `packages/vscode-extension/src/ui/configuration-webview-html.ts`
- `packages/vscode-extension/src/utils/unified-config.ts`
- `packages/vscode-extension/src/extension.ts`

Current VS Code configuration UI has concepts like:

- global active instance;
- workspace active instance override;
- project settings;
- sync folder settings.

Environment model requires UI changes:

1. show workspace environments;
2. allow add/edit/remove environment;
3. allow pin active workspace environment;
4. show effective instance/project/sync folder from active environment;
5. pass environment selection into CLI/core operations.

### 13.1 Snapshot Shape

`N8nConfigurationSnapshot` should include:

```ts
workspace: {
    version: 4;
    activeEnvironmentId?: string;
    environments: Array<{
        id: string;
        name: string;
        instanceId: string;
        instanceName?: string;
        projectId?: string;
        projectName?: string;
        syncFolder: string;
        workflowDir?: string;
    }>;
}
```

### 13.2 Extension Command Targeting

Any extension command that currently uses effective context should use active environment by default.

Later UI can allow “Run this action in environment…” QuickPick.

---

## 14. Agent And Skills Impact

Relevant files:

- `skills/n8n-architect/SKILL.md`
- `skills/n8n-manager/SKILL.md`
- `packages/skills/src/agent-skills/n8n-manager/SKILL.md`
- `packages/skills/src/services/ai-context-generator.ts`
- plugin copies under `plugins/*/n8n-as-code/skills/*`

Agent instructions should change from workspace instance pinning to environment usage.

Replace guidance like:

```bash
npx --yes n8nac workspace pin-instance --instance-id <id>
```

with:

```bash
npx --yes n8nac env add Dev --instance-id <id> --project-id <project-id> --project-name <project-name> --sync-folder workflows/dev
npx --yes n8nac env pin Dev
```

Agent behavior:

- use pinned environment by default;
- when user asks “deploy to Production”, use `n8nac promote ... --to Prod`;
- when user asks “check Prod”, use `n8nac --env Prod ...`;
- never manually copy files between environment folders if `promote` exists;
- never assume credentials are portable.

---

## 15. Documentation Impact

Relevant docs:

- `README.md`
- `packages/cli/README.md`
- `docs/docs/getting-started/index.md`
- `docs/docs/contribution/architecture.md`
- `docs/docs/contribution/sync.md`

Later user docs should explain:

- what an environment is;
- how it differs from an instance;
- how to add/pin/list environments;
- how sync paths are structured;
- how promotion works;
- what promotion does not do.

Suggested docs wording:

```text
An environment is a workspace-level target composed of an n8n instance, an n8n project, and its own local sync folder. You can set a default environment for normal work, and explicitly promote workflows between environments when needed.
```

---

## 16. Migration Strategy

### 16.1 Existing v3 Workspace Configs

Do not destructively rewrite on read.

If v3 exists:

```json
{
  "version": 3,
  "activeInstanceId": "test",
  "syncFolder": "workflows-test",
  "projectId": "project-test",
  "projectName": "Test Project"
}
```

`ConfigService` can expose it as implicit environment:

```json
{
  "id": "default",
  "name": "Default",
  "instanceId": "test",
  "syncFolder": "workflows-test",
  "projectId": "project-test",
  "projectName": "Test Project"
}
```

When user runs an env write command, persist v4.

### 16.2 Legacy Commands

Product/docs should move to `env`.

This spec intentionally does not preserve direct `--instance` targeting as a user-facing compatibility path.

### 16.3 Generated AI Context

`update-ai` should regenerate instructions that use environments.

If a workspace has v3 config, generated instructions can say:

```text
This workspace uses a legacy default environment. Run `n8nac env status` to inspect it, or `n8nac env add ...` to create named environments.
```

---

## 17. Testing Plan

### 17.1 Unit Tests: ConfigService

Update/add tests in:

- `packages/cli/tests/unit/config-service.test.ts`

Cases:

1. creates v4 environment config with `env add`;
2. pins environment and resolves it by default;
3. explicit environment overrides pinned environment;
4. resolves by environment ID;
5. resolves by case-insensitive environment name;
6. errors on unknown environment;
7. errors on duplicate environment name if allowed by malformed config;
8. project settings do not leak across environments;
9. sync folder settings do not leak across environments;
10. v3 workspace config is exposed as implicit default environment;
11. v3 is only rewritten to v4 on write command;
12. missing project gives environment-aware error;
13. missing sync folder gives environment-aware error;
14. environment with instance default project resolves project from global instance.

### 17.2 Integration Tests: CLI Environment Commands

Add test file:

```text
packages/cli/tests/integration/environment-cli.integration.test.ts
```

Cases:

1. `n8nac env add Dev ... --json` writes v4 config;
2. `n8nac env list --json` includes resolved instance info;
3. `n8nac env pin Dev` sets active environment;
4. `n8nac env status --json` shows effective context;
5. `n8nac --env Prod workspace status --json` or equivalent shows Prod context;
6. global option parsing works with `help --env Dev skills`;
7. removed direct instance targeting is not in `n8nac --help`.

### 17.3 Sync Isolation Tests

Use existing sync tests as model:

- `packages/cli/tests/integration/list-archived.integration.test.ts`
- `packages/cli/tests/scenarios/sync-scenarios.test.ts`

Cases:

1. Dev and Prod environments produce different `workflowDir` values;
2. `.n8n-state.json` is written under selected environment only;
3. `.n8n-sync-events.jsonl` is written under selected environment only;
4. `list --env Dev` uses Dev project ID;
5. `list --env Prod` uses Prod project ID.

### 17.4 Promotion Tests

Add:

```text
packages/cli/tests/unit/promote-command.test.ts
packages/cli/tests/integration/promote-cli.integration.test.ts
```

Cases:

1. promotion copies source file to target relative path;
2. promotion rewrites project metadata to target project;
3. promotion strips source workflow ID when target file does not exist;
4. promotion preserves target workflow ID when target file exists;
5. promotion refuses same source/target env;
6. promotion refuses source path outside source workflowDir;
7. `--dry-run` does not write or push;
8. `--no-push` writes target file but does not call API;
9. failed target push leaves clear diagnostics.

### 17.5 VS Code Tests

Update/add unit tests around:

- `packages/vscode-extension/tests/unit/unified-config.test.ts`

Cases:

1. reads v4 environment config;
2. active environment controls effective display;
3. saving workspace environment writes correct config shape;
4. deleting active env requires explicit fallback or clears active environment.

---

## 18. Implementation Phases

### Phase 1: Architecture Doc

Create target architecture document:

```text
architecture/target/workspace-environments-and-promotion.md
```

### Phase 2: Config Model

Implement v4 workspace config parsing/writing in `ConfigService`.

Add environment types, methods, and tests.

### Phase 3: CLI Environment Commands

Add `env` and `environment` commands.

Add global `--env` option.

Route `BaseCommand` through environment resolution.

### Phase 4: Sync Integration

Make `getSyncConfig()` environment-aware.

Add environment metadata to `ISyncConfig`.

Verify list/pull/push/fetch/resolve/test/workflow/execution/credential commands use selected environment.

### Phase 5: Promotion MVP

Add `n8nac promote <path> --from <env> --to <env>`.

Implement safe file adaptation and target push.

### Phase 6: VS Code And Agent Guidance

Update VS Code configuration snapshot and UI.

Update skills and generated agent context.

### Phase 7: Documentation

Update README, CLI README, getting started, and contribution architecture docs.

---

## 19. Open Technical Questions

1. Should v4 workspace config be fully owned by n8nac, or should n8n-manager-core learn v4 environment schema?

Recommended answer: n8nac owns it initially.

2. Should environment `syncFolder` point to the root environment folder or the final workflow directory?

Recommended answer: root environment folder. Final `workflowDir` remains computed as `syncFolder/instanceIdentifier/projectSlug`.

3. Should `env add` require project fields?

Recommended answer: yes for sync-ready environments, but allow `--use-instance-default-project` or fallback if instance has a default project.

4. Should `promote` push by default?

Recommended answer: yes. Promotion means deployment. Provide `--no-push` and `--dry-run` for safety.

5. Should promotion use file path or workflow ID first?

Recommended answer: file path first. It is deterministic and avoids remote ambiguity.

6. Should environment names be unique?

Recommended answer: yes. Enforce unique ID and case-insensitive unique name.

---

## 20. Risks

### 20.1 Config Ownership Split

Direct v4 parsing in n8nac while n8n-manager-core still reads v3 can create two interpretations of `n8nac-config.json`.

Mitigation:

- centralize all v4 environment reads/writes in `ConfigService`;
- do not call `manager.writeWorkspaceOverrides()` for v4 environment updates;
- update adapter/extension to consume `ConfigService` or equivalent environment-aware facade.

### 20.2 Promotion Duplicates

If target file does not exist, promotion creates a new remote workflow. Re-running may duplicate if target file or state is lost.

Mitigation:

- use target relative path as MVP identity;
- after first push, target file contains target workflow ID;
- future logical deployment keys can improve this.

### 20.3 Credential Mismatch

A workflow promoted to Prod may reference credentials that do not exist in Prod.

Mitigation:

- warn after promotion;
- provide `credential-required` checks in target env;
- do not auto-map credentials in MVP.

### 20.4 Breaking Existing User Habits

Moving from instance targeting to environment targeting changes user vocabulary.

Mitigation:

- make env commands easy;
- provide clear errors;
- generate better agent guidance;
- make migration from v3 simple.

---

## 21. Acceptance Criteria

Product acceptance:

- users can define multiple environments per workspace;
- users can pin a default environment;
- users can target an environment explicitly with `--env`;
- users can promote a workflow from one environment to another;
- docs and agent guidance explain environments, not direct instance targeting.

Technical acceptance:

- v4 workspace config stores environment list and active environment;
- ConfigService resolves explicit/pinned environments correctly;
- project/sync settings do not leak between environments;
- sync state remains physically isolated per environment;
- promotion preserves target IDs and strips source IDs as needed;
- tests cover config, CLI, sync isolation, and promotion.

---

## 22. Final Product Wording

High-level product description:

```text
In n8n-as-code, an environment is a workspace-level target composed of an n8n instance, an n8n project, and its own local sync folder. Users can create as many environments as needed, choose a default one for normal work, and explicitly promote workflows between environments when they want to move work from Dev to Staging or Production.
```

Short version:

```text
n8n-manager owns instances. n8nac owns workspace environments. Git owns review and versioning. promote owns explicit workflow movement between environments.
```
