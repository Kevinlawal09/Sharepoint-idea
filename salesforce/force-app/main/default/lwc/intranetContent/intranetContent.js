/**
 * Static intranet content, ported from Sharepoint-idea/public/content.js.
 * News is placeholder copy; move it to Salesforce CMS or a custom object when comms is ready to own it.
 * Department ids must match SharePoint_Location__mdt.Department__c.
 */
export const DEPARTMENTS = [
    {
        id: 'executive-hr',
        name: 'Executive & Human Resources',
        tagline: 'Announcements, policies, benefits, time off and onboarding.',
        icon: 'utility:people'
    },
    {
        id: 'finance-it-ops',
        name: 'Finance / IT / Operations',
        tagline: 'Budgets, expenses, IT support, pledge processing and facilities.',
        icon: 'utility:chart'
    },
    {
        id: 'crm',
        name: 'CRM Implementation',
        tagline: 'The Andar CRM project: timeline, training and office hours.',
        icon: 'utility:settings'
    },
    {
        id: 'marketing',
        name: 'Marketing',
        tagline: 'Brand guidelines, templates, campaign calendar and support requests.',
        icon: 'utility:announcement'
    },
    {
        id: 'fundraising',
        name: 'Fundraising',
        tagline: 'Major gifts, resource development and campaign tools.',
        icon: 'utility:moneybag'
    },
    {
        id: 'community',
        name: 'Community Investments',
        tagline: 'Grant cycles, partner agencies and impact reporting.',
        icon: 'utility:company'
    }
];

export const NEWS = [
    {
        id: 'n1',
        departmentId: 'crm',
        departmentLabel: 'CRM Implementation',
        title: 'Andar Discovery Phase Kicks Off',
        teaser: 'Phase 1 discovery sessions start this month. See the timeline and how to get involved.',
        posted: '2 days ago'
    },
    {
        id: 'n2',
        departmentId: 'executive-hr',
        departmentLabel: 'Human Resources',
        title: 'Open Enrollment Opens Oct 1',
        teaser: 'Review your benefits options and add the enrollment sessions to your calendar.',
        posted: '4 days ago'
    },
    {
        id: 'n3',
        departmentId: 'fundraising',
        departmentLabel: 'Fundraising',
        title: 'Campaign Passes the Halfway Mark',
        teaser: 'Thank you to every team that has pledged so far, and here is how to get involved.',
        posted: '6 days ago'
    }
];

export function departmentName(id) {
    const match = DEPARTMENTS.find((dept) => dept.id === id);
    return match ? match.name : '';
}