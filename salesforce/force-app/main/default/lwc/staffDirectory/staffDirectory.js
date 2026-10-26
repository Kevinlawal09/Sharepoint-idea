import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getStaff from '@salesforce/apex/DirectoryController.getStaff';
import { errorMessage } from 'c/intranetUtils';

const ALL = '';

export default class StaffDirectory extends NavigationMixin(LightningElement) {
    people = [];
    search = '';
    department = ALL;
    view = 'directory';
    error;
    isLoading = true;

    @wire(getStaff)
    handleStaff({ data, error }) {
        if (data) {
            this.people = data.map((person) => ({
                ...person,
                cardClass: `uw-card person ${person.isPlaceholder ? 'person_placeholder' : ''}`,
                searchText: [person.name, person.title, person.department, person.email].filter(Boolean).join(' ').toLowerCase(),
                mailto: person.email ? `mailto:${person.email}` : null,
                teamsChat: person.email ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(person.email)}` : null,
                tel: person.phone ? `tel:${person.phone.replace(/[^\d+]/g, '')}` : null
            }));
            this.error = undefined;
            this.isLoading = false;
        } else if (error) {
            this.error = errorMessage(error);
            this.isLoading = false;
        }
    }

    get departmentOptions() {
        const departments = [...new Set(this.people.map((p) => p.department).filter(Boolean))].sort();
        return [{ label: 'All departments', value: ALL }, ...departments.map((d) => ({ label: d, value: d }))];
    }

    get visiblePeople() {
        const terms = this.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return this.people.filter(
            (person) =>
                (this.department === ALL || person.department === this.department) &&
                terms.every((term) => person.searchText.includes(term))
        );
    }

    get isDirectoryView() {
        return this.view === 'directory';
    }

    get isChartView() {
        return this.view === 'chart';
    }

    get directoryTabClass() {
        return `uw-btn uw-btn_small uw-btn_ghost ${this.isDirectoryView ? 'uw-btn_active' : ''}`;
    }

    get chartTabClass() {
        return `uw-btn uw-btn_small uw-btn_ghost ${this.isChartView ? 'uw-btn_active' : ''}`;
    }

    get showDirectory() {
        return this.isDirectoryView && !this.isLoading && this.visiblePeople.length > 0;
    }

    get showNoMatches() {
        return this.isDirectoryView && !this.isLoading && !this.error && this.people.length > 0;
    }

    /** lightning-tree items built from each person's Manager. Top of the chart = people with no manager in the list. */
    get orgChart() {
        const byManager = new Map();
        const ids = new Set(this.people.map((p) => p.id));
        this.people.forEach((person) => {
            const managerKey = person.managerId && ids.has(person.managerId) ? person.managerId : null;
            if (!byManager.has(managerKey)) {
                byManager.set(managerKey, []);
            }
            byManager.get(managerKey).push(person);
        });

        const build = (managerKey, depth) =>
            (byManager.get(managerKey) || []).map((person) => {
                const items = build(person.id, depth + 1);
                return {
                    label: person.name,
                    name: person.id,
                    metatext: [
                        person.title,
                        items.length ? `${items.length} direct report${items.length === 1 ? '' : 's'}` : null,
                        person.isPlaceholder ? 'not on Salesforce yet' : null
                    ]
                        .filter(Boolean)
                        .join(' · '),
                    expanded: depth < 2,
                    items
                };
            });

        // Leaders (people with reports) first, then anyone not yet placed in the chart.
        return build(null, 0).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
    }

    get hasChart() {
        return !this.isLoading && this.people.some((p) => p.managerId);
    }

    get showChartEmpty() {
        return !this.isLoading && !this.error;
    }

    switchView(event) {
        this.view = event.currentTarget.dataset.view;
    }

    handleChartSelect(event) {
        this.navigateToProfile(event.detail.name);
    }

    get countLabel() {
        if (this.isLoading || this.error) {
            return '';
        }
        const shown = this.visiblePeople.length;
        return shown === this.people.length ? `${shown} people.` : `Showing ${shown} of ${this.people.length}.`;
    }

    handleSearch(event) {
        this.search = event.detail.value || '';
    }

    handleDepartment(event) {
        this.department = event.detail.value;
    }

    openProfile(event) {
        this.navigateToProfile(event.currentTarget.dataset.id);
    }

    navigateToProfile(userId) {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Intranet_Profile' },
            state: { c__userId: userId }
        });
    }
}