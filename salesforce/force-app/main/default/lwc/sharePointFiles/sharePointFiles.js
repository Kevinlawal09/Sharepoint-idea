import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import getLocations from '@salesforce/apex/SharePointService.getLocations';
import listFromLink from '@salesforce/apex/SharePointService.listFromLink';
import listFolder from '@salesforce/apex/SharePointService.listFolder';
import { DEPARTMENTS, departmentName } from 'c/intranetContent';
import { errorMessage, fileIcon, formatBytes, formatDate } from 'c/intranetUtils';

/**
 * One browser for every SharePoint link the intranet used to show as separate LWCs.
 * Links come from SharePoint_Location__mdt; folder contents come live from Microsoft Graph.
 */
export default class SharePointFiles extends NavigationMixin(LightningElement) {
    /** Locks the browser to one department (set in App Builder). Blank lets people pick. */
    @api department;

    activeDepartment = '';
    locations = [];
    // Breadcrumb trail. The first entry is a configured link ({ url }); later ones are folders ({ driveId, itemId }).
    trail = [];
    items = [];
    search = '';
    isLoading = false;
    error;

    connectedCallback() {
        if (this.department) {
            this.activeDepartment = this.department;
        }
    }

    @wire(CurrentPageReference)
    handlePageReference(pageRef) {
        const requested = pageRef?.state?.c__department;
        if (requested && !this.department && requested !== this.activeDepartment) {
            this.activeDepartment = requested;
            this.resetBrowse();
        }
    }

    @wire(getLocations, { department: '$activeDepartment' })
    handleLocations({ data, error }) {
        if (data) {
            this.locations = data;
            this.error = undefined;
        } else if (error) {
            this.locations = [];
            this.error = errorMessage(error);
        }
    }

    // ------------------------------------------------------------ View state

    get title() {
        return departmentName(this.activeDepartment) || 'Department files';
    }

    get showDepartmentPicker() {
        return !this.department;
    }

    get departmentPills() {
        return [{ id: '', name: 'All' }, ...DEPARTMENTS].map((dept) => {
            const active = dept.id === this.activeDepartment;
            return {
                key: dept.id || 'all',
                id: dept.id,
                name: dept.name,
                pressed: String(active),
                className: `uw-btn uw-btn_small uw-btn_ghost ${active ? 'uw-btn_active' : ''}`
            };
        });
    }

    get isBrowsing() {
        return this.trail.length > 0;
    }

    get showLocations() {
        return !this.isBrowsing && !this.isLoading;
    }

    get hasLocations() {
        return this.locations.length > 0;
    }

    get showItems() {
        return this.isBrowsing && !this.isLoading && !this.error;
    }

    get crumbs() {
        const last = this.trail.length - 1;
        return this.trail.map((crumb, index) => ({ ...crumb, index, isLast: index === last }));
    }

    get visibleItems() {
        const term = this.search.trim().toLowerCase();
        return term ? this.items.filter((item) => item.name.toLowerCase().includes(term)) : this.items;
    }

    get hasItems() {
        return this.visibleItems.length > 0;
    }

    get emptyMessage() {
        return this.search.trim() ? `Nothing in this folder matches "${this.search.trim()}".` : 'This folder is empty.';
    }

    // -------------------------------------------------------------- Handlers

    selectDepartment(event) {
        this.activeDepartment = event.currentTarget.dataset.id;
        this.resetBrowse();
    }

    handleSearch(event) {
        this.search = event.detail.value || '';
    }

    openLocation(event) {
        const location = this.locations.find((loc) => loc.id === event.currentTarget.dataset.id);
        this.trail = [{ key: location.id, label: location.label, url: location.url }];
        this.load(() => listFromLink({ sharePointUrl: location.url }));
    }

    openItem(event) {
        const item = this.items.find((i) => i.id === event.currentTarget.dataset.id);
        if (!item.isFolder) {
            this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url: item.webUrl } });
            return;
        }
        this.trail = [...this.trail, { key: item.id, label: item.name, driveId: item.driveId, itemId: item.id }];
        this.load(() => listFolder({ driveId: item.driveId, itemId: item.id }));
    }

    goToCrumb(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (index < 0) {
            this.resetBrowse();
            return;
        }
        const crumb = this.trail[index];
        this.trail = this.trail.slice(0, index + 1);
        this.load(() =>
            crumb.url ? listFromLink({ sharePointUrl: crumb.url }) : listFolder({ driveId: crumb.driveId, itemId: crumb.itemId })
        );
    }

    // --------------------------------------------------------------- Helpers

    async load(fetchItems) {
        this.isLoading = true;
        this.error = undefined;
        this.search = '';
        try {
            this.items = decorate(await fetchItems());
        } catch (e) {
            this.items = [];
            this.error = errorMessage(e);
        } finally {
            this.isLoading = false;
        }
    }

    resetBrowse() {
        this.trail = [];
        this.items = [];
        this.search = '';
        this.error = undefined;
    }
}

function decorate(rawItems) {
    return [...rawItems]
        .sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1))
        .map((item) => ({
            ...item,
            icon: fileIcon(item.name, item.isFolder),
            kind: item.isFolder ? 'Folder' : 'File',
            info: item.isFolder
                ? `${item.childCount || 0} items`
                : [formatBytes(item.size), formatDate(item.modified), item.modifiedBy].filter(Boolean).join(' · '),
            actionIcon: item.isFolder ? 'utility:chevronright' : 'utility:new_window',
            actionTitle: item.isFolder ? `Open ${item.name}` : `Open ${item.name} in SharePoint`
        }));
}