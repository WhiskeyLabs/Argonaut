
import React from "react";
import ResearchPageClient from "./ResearchPageClient";

interface PageProps {
    params: Promise<{
        id: string;
        findingId: string;
    }>;
}

export default async function ResearchPage({ params }: PageProps) {
    // Await params in Next.js 15
    const { id, findingId } = await params;

    return (
        <ResearchPageClient sessionId={id} findingId={findingId} />
    );
}
