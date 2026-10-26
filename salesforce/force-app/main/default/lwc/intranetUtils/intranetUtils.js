import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LOCALE from '@salesforce/i18n/locale';
import TIME_ZONE from '@salesforce/i18n/timeZone';

/** Readable message from an Apex/LDS error or a thrown Error. */
export function errorMessage(error) {
    if (!error) {
        return 'Something went wrong.';
    }
    if (Array.isArray(error.body)) {
        return error.body.map((e) => e.message).join(', ');
    }
    return error.body?.message || error.message || 'Something went wrong.';
}

export function showToast(target, title, message, variant = 'success') {
    target.dispatchEvent(new ShowToastEvent({ title, message, variant }));
}

function format(value, options) {
    return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...options }).format(new Date(value));
}

export function formatDate(value) {
    return value ? format(value, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

export function timeAgo(value) {
    if (!value) {
        return '';
    }
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(value);
}

/** Pieces for the calendar-style date block on event cards. */
export function eventDateParts(value) {
    if (!value) {
        return { month: '', day: '', time: 'Date to be announced' };
    }
    return {
        month: format(value, { month: 'short' }),
        day: format(value, { day: 'numeric' }),
        time: format(value, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
    };
}

export function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) {
        return '';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }
    return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

const DOC_TYPES = {
    pdf: 'doctype:pdf',
    doc: 'doctype:word',
    docx: 'doctype:word',
    xls: 'doctype:excel',
    xlsx: 'doctype:excel',
    csv: 'doctype:csv',
    ppt: 'doctype:ppt',
    pptx: 'doctype:ppt',
    png: 'doctype:image',
    jpg: 'doctype:image',
    jpeg: 'doctype:image',
    gif: 'doctype:image',
    mp4: 'doctype:video',
    mov: 'doctype:video',
    zip: 'doctype:zip',
    txt: 'doctype:txt'
};

export function fileIcon(name, isFolder) {
    if (isFolder) {
        return 'doctype:folder';
    }
    const extension = (name || '').split('.').pop().toLowerCase();
    return DOC_TYPES[extension] || 'doctype:unknown';
}