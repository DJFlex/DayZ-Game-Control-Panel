import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Branding } from '../models';
import { AuthService } from '../../auth/services/auth.service';

/**
 * Defaults that reproduce the stock DayZ Server Manager look. Used before the
 * public branding endpoint responds and to fill any missing fields.
 */
export const DEFAULT_BRANDING: Branding = {
    title: 'DayZ Server Manager',
    footerText: '',
    loginHeading: 'Login',
    loginTagline: '',
    colors: {
        primary: '#007bff',
        accent: '#0056b3',
        sidebar: '#212529',
        card: '#007bff',
    },
    logoTopbar: '',
    logoLogin: '',
    favicon: '',
    loginBackground: '',
};

/**
 * Loads and applies white-label branding.
 *
 * Branding is fetched from the PUBLIC GET /api/branding endpoint (no auth) so it
 * can be applied on the login screen before login. Applying it sets the brand
 * CSS custom properties (shared by both light and dark themes), the document
 * title and the favicon, and exposes the current branding to components (top-nav
 * logo, footer text, login screen).
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {

    private branding$ = new BehaviorSubject<Branding>({ ...DEFAULT_BRANDING });

    public constructor(
        private http: HttpClient,
        private auth: AuthService,
    ) {}

    public get branding(): Branding {
        return this.branding$.value;
    }

    public get changes(): Observable<Branding> {
        return this.branding$.asObservable();
    }

    /** Fetch branding from the public endpoint (defaults merged). */
    public fetch(): Observable<Branding> {
        return this.http.get<Branding>('/api/branding');
    }

    /** Fetch branding from the public endpoint and apply it. */
    public load(): void {
        this.fetch().subscribe(
            (b) => this.apply(b),
            (e) => console.error('Failed to load branding', e),
        );
    }

    /** Apply a branding object: CSS variables, document title, favicon, subject. */
    public apply(branding?: Partial<Branding>): void {
        const merged = this.withDefaults(branding);
        this.branding$.next(merged);

        // eslint-disable-next-line no-undef
        const root = document.documentElement;
        root.style.setProperty('--brand-primary', merged.colors.primary);
        root.style.setProperty('--brand-accent', merged.colors.accent);
        root.style.setProperty('--brand-sidebar', merged.colors.sidebar);
        root.style.setProperty('--brand-card', merged.colors.card);

        if (merged.loginBackground) {
            root.style.setProperty('--brand-login-bg', `url("${merged.loginBackground}")`);
        } else {
            root.style.removeProperty('--brand-login-bg');
        }

        // eslint-disable-next-line no-undef
        document.title = merged.title || DEFAULT_BRANDING.title;

        if (merged.favicon) {
            this.setFavicon(merged.favicon);
        }
    }

    /** Persist branding (admin only). */
    public save(branding: Branding): Observable<any> {
        return this.http.post(
            '/api/branding',
            { branding },
            {
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
                responseType: 'text',
            },
        );
    }

    public withDefaults(branding?: Partial<Branding>): Branding {
        return {
            ...DEFAULT_BRANDING,
            ...(branding || {}),
            colors: {
                ...DEFAULT_BRANDING.colors,
                ...((branding || {}).colors || {}),
            },
        };
    }

    private setFavicon(href: string): void {
        // eslint-disable-next-line no-undef
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
        if (!link) {
            // eslint-disable-next-line no-undef
            link = document.createElement('link');
            link.rel = 'icon';
            // eslint-disable-next-line no-undef
            document.head.appendChild(link);
        }
        link.href = href;
    }

}
