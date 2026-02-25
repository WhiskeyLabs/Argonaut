import { db } from '../db';
import { Project } from '../types/finding';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing Project entities.
 * Concept: A Project is a stable container for Scan Sessions and Findings over time.
 */
export const ProjectService = {
    /**
     * Create a new project.
     */
    async createProject(name: string, rootPath?: string): Promise<Project> {
        const project: Project = {
            id: uuidv4(),
            name,
            rootPath,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await db.projects.add(project);
        return project;
    },

    /**
     * get a project by ID.
     */
    async getProject(id: string): Promise<Project | undefined> {
        return db.projects.get(id);
    },

    /**
     * Get a project by exact name match.
     */
    async getProjectByName(name: string): Promise<Project | undefined> {
        return db.projects.where('name').equals(name).first();
    },

    /**
     * Find or create a project.
     * Useful during import when we infer a project name.
     */
    async getOrCreateProject(name: string, rootPath?: string): Promise<Project> {
        const existing = await this.getProjectByName(name);
        if (existing) {
            return existing;
        }
        return this.createProject(name, rootPath);
    },

    /**
     * List all projects, most recently updated first.
     */
    async getAllProjects(): Promise<Project[]> {
        return db.projects.orderBy('updatedAt').reverse().toArray();
    },

    /**
     * Delete a project and all session-linked data beneath it.
     * This is destructive and should only be called after explicit user confirmation.
     */
    async deleteProjectCascade(projectId: string): Promise<{
        deletedSessions: number;
        deletedFindings: number;
        deletedArtifacts: number;
    }> {
        const allSessions = await db.sessions.toArray();
        const projectSessions = allSessions.filter((s: { id: string; projectId?: string }) => s.projectId === projectId);
        const sessionIds = projectSessions.map(s => s.id);

        if (sessionIds.length === 0) {
            await db.projects.delete(projectId);
            return { deletedSessions: 0, deletedFindings: 0, deletedArtifacts: 0 };
        }

        const findingIds = await db.findings.where('sessionId').anyOf(sessionIds).primaryKeys() as string[];
        const artifactIds = await db.session_artifacts.where('sessionId').anyOf(sessionIds).primaryKeys() as string[];

        await db.transaction(
            'rw',
            db.projects,
            db.sessions,
            db.findings,
            db.session_artifacts,
            db.derived_graph_indices,
            db.events,
            db.finding_events,
            db.fix_suggestions,
            async () => {
                await db.findings.where('sessionId').anyOf(sessionIds).delete();
                await db.session_artifacts.where('sessionId').anyOf(sessionIds).delete();
                await db.derived_graph_indices.where('sessionId').anyOf(sessionIds).delete();
                await db.events.where('sessionId').anyOf(sessionIds).delete();
                await db.fix_suggestions.where('sessionId').anyOf(sessionIds).delete();

                if (findingIds.length > 0) {
                    await db.finding_events.where('findingId').anyOf(findingIds).delete();
                }

                await db.sessions.where('id').anyOf(sessionIds).delete();
                await db.projects.delete(projectId);
            }
        );

        return {
            deletedSessions: sessionIds.length,
            deletedFindings: findingIds.length,
            deletedArtifacts: artifactIds.length
        };
    }
};
