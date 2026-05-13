import * as fs from 'fs';
import * as path from 'path';

type SnapshotForAiContextPolicy = {
    workspaceRoot?: string;
    hasWorkspaceConfig?: boolean;
};

export function hasExplicitWorkspaceConfig(
    workspaceRoot: string | undefined,
    existsSync: (filePath: string) => boolean = fs.existsSync,
): boolean {
    return Boolean(workspaceRoot && existsSync(path.join(workspaceRoot, 'n8nac-config.json')));
}

export function shouldAutoEnsureAiContext(input: {
    workspaceRoot?: string;
    snapshot?: SnapshotForAiContextPolicy;
    existsSync?: (filePath: string) => boolean;
}): boolean {
    const { workspaceRoot, snapshot, existsSync = fs.existsSync } = input;
    if (!workspaceRoot) return false;

    if (snapshot?.workspaceRoot === workspaceRoot) {
        return Boolean(snapshot.hasWorkspaceConfig);
    }

    return hasExplicitWorkspaceConfig(workspaceRoot, existsSync);
}
