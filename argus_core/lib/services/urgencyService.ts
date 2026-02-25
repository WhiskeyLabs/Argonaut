
import { ThreatIntel, Urgency } from '../types/threat';

export class UrgencyService {
    /**
     * Calculates the urgency based on Threat Intelligence data.
     * 
     * LOGIC:
     * - IMMEDIATE: Confirmed Active Exploit (KEV=true) OR High Probability (EPSS >= 0.1 / 10%)
     * - SOON: Elevated Probability (EPSS >= 0.01 / 1%)
     * - WATCH: Any non-zero EPSS
     * - LOW: No observable activity
     */
    public static calculateUrgency(threat: ThreatIntel | null | undefined): Urgency {
        if (!threat) {
            return 'LOW';
        }

        if (threat.kev || threat.epssScore >= 0.1) {
            return 'IMMEDIATE';
        }

        if (threat.epssScore >= 0.01) {
            return 'SOON';
        }

        if (threat.epssScore > 0) {
            return 'WATCH';
        }

        return 'LOW';
    }

    /**
     * Returns a color code for the urgency level.
     */
    public static getUrgencyColor(urgency: Urgency): string {
        switch (urgency) {
            case 'IMMEDIATE': return '#EF4444'; // Red-500
            case 'SOON': return '#F97316';      // Orange-500
            case 'WATCH': return '#EAB308';     // Yellow-500
            case 'LOW': return '#9CA3AF';       // Gray-400
            default: return '#9CA3AF';
        }
    }

    public static getUrgencyLabel(urgency: Urgency): string {
        return urgency;
    }
}
