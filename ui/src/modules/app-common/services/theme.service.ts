import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeName = 'light' | 'dark';

/**
 * Manages the light/dark theme.
 *
 * The theme is applied by toggling `data-theme="dark"` on the <html> element
 * (see ui/src/styles/_theme.scss). The initial value is also applied by a tiny
 * inline script in index.html to avoid a flash of the wrong theme before Angular
 * boots; this service keeps that in sync and persists the choice to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

    private static readonly STORAGE_KEY = 'dzsm-theme';

    private theme$ = new BehaviorSubject<ThemeName>('light');

    public constructor() {
        let saved: ThemeName = 'light';
        try {
            // eslint-disable-next-line no-undef
            saved = (localStorage.getItem(ThemeService.STORAGE_KEY) as ThemeName) || 'light';
        } catch { /* localStorage may be unavailable */ }
        this.setTheme(saved === 'dark' ? 'dark' : 'light');
    }

    public get theme(): ThemeName {
        return this.theme$.value;
    }

    public get isDark(): boolean {
        return this.theme$.value === 'dark';
    }

    public get changes(): Observable<ThemeName> {
        return this.theme$.asObservable();
    }

    public setTheme(theme: ThemeName): void {
        this.theme$.next(theme);

        // eslint-disable-next-line no-undef
        const root = document.documentElement;
        if (theme === 'dark') {
            root.setAttribute('data-theme', 'dark');
        } else {
            root.removeAttribute('data-theme');
        }

        try {
            // eslint-disable-next-line no-undef
            localStorage.setItem(ThemeService.STORAGE_KEY, theme);
        } catch { /* localStorage may be unavailable */ }
    }

    public toggle(): void {
        this.setTheme(this.isDark ? 'light' : 'dark');
    }

}
