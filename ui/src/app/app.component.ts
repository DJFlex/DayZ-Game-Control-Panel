import { Component } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ChildActivationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from '../modules/app-common/services/theme.service';
import { BrandingService } from '../modules/app-common/services/branding.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent {

    public title = 'ServerManager';

    public constructor(
        public router: Router,
        private titleService: Title,
        // injected so the theme is initialised/applied app-wide at startup
        private themeService: ThemeService,
        private brandingService: BrandingService,
    ) {
        // fetch + apply white-label branding as early as possible (public endpoint,
        // so it also brands the login screen before login)
        this.brandingService.load();
        this.router.events
            .pipe(filter((event) => event instanceof ChildActivationEnd))
            .subscribe((event) => {
                // eslint-disable-next-line prefer-destructuring
                let snapshot = ((event) as ChildActivationEnd).snapshot;
                while (snapshot.firstChild !== null) {
                    snapshot = snapshot.firstChild;
                }
                this.titleService.setTitle(snapshot.data['title'] || 'ServerManager');
            });
    }

}
