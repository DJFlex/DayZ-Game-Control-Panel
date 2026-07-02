import { Component, OnInit } from '@angular/core';
import { Branding } from '../../../app-common/models';
import { BrandingService, DEFAULT_BRANDING } from '../../../app-common/services/branding.service';

type ImageField = 'logoTopbar' | 'logoLogin' | 'favicon' | 'loginBackground';

@Component({
    selector: 'sb-branding',
    templateUrl: './branding.component.html',
    styleUrls: ['branding.component.scss'],
})
export class BrandingComponent implements OnInit {

    public model!: Branding;
    public loading = true;

    public readonly colorFields: { key: keyof Branding['colors']; label: string }[] = [
        { key: 'primary', label: 'Primary' },
        { key: 'accent', label: 'Accent (hover)' },
        { key: 'sidebar', label: 'Sidebar' },
        { key: 'card', label: 'Metric Cards' },
    ];

    public readonly imageFields: { key: ImageField; label: string; hint: string }[] = [
        { key: 'logoTopbar', label: 'Top-bar Logo', hint: 'Shown in the top navigation bar. Empty = show the title text.' },
        { key: 'logoLogin', label: 'Login Logo', hint: 'Shown on the login screen. Empty = show the heading text.' },
        { key: 'favicon', label: 'Favicon', hint: 'Browser tab icon.' },
        { key: 'loginBackground', label: 'Login Background', hint: 'Full-page background image on the login screen.' },
    ];

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

    public constructor(
        public brandingService: BrandingService,
    ) {}

    public ngOnInit(): void {
        this.reset();
    }

    public reset(): void {
        this.loading = true;
        this.brandingService.fetch().toPromise().then(
            (branding) => {
                this.model = this.clone(this.brandingService.withDefaults(branding));
                // re-apply the persisted branding (undo any un-saved live preview)
                this.brandingService.apply(this.model);
                this.loading = false;
            },
            (err) => {
                console.error(err);
                this.model = this.clone(DEFAULT_BRANDING);
                this.loading = false;
            },
        );
    }

    public resetToDefaults(): void {
        this.model = this.clone(DEFAULT_BRANDING);
        this.preview();
    }

    /** Apply the in-progress model live (updates CSS vars / title app-wide). */
    public preview(): void {
        this.brandingService.apply(this.model);
    }

    public onImageSelected(event: Event, field: ImageField): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            this.model[field] = reader.result as string;
            this.preview();
        };
        reader.onerror = () => {
            this.outcomeBadge = {
                message: `Failed to read image "${file.name}"`,
                success: false,
            };
        };
        reader.readAsDataURL(file);
        // allow re-selecting the same file later
        input.value = '';
    }

    public clearImage(field: ImageField): void {
        this.model[field] = '';
        this.preview();
    }

    public save(): void {
        this.loading = true;
        this.brandingService.save(this.model).toPromise().then(
            () => {
                this.brandingService.apply(this.model);
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Successfully updated branding',
                    success: true,
                };
            },
            (err) => {
                console.error(err);
                this.loading = false;
                this.outcomeBadge = {
                    message: 'Failed to update branding. Admin rights are required.',
                    success: false,
                };
            },
        );
    }

    private clone(branding: Branding): Branding {
        return JSON.parse(JSON.stringify(branding));
    }

}
