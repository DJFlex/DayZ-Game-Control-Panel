/* tslint:disable: ordered-imports*/
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

/* Module */
import { BrandingModule } from './branding.module';

import { SBRouteData } from '../navigation/models';
import { BrandingComponent } from './containers/branding/branding.component';

/* Routes */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ROUTES: Routes = [
    {
        path: '',
        canActivate: [],
        component: BrandingComponent,
        data: {
            title: 'Branding',
            breadcrumbs: [
                {
                    text: 'Dashboard',
                    link: '/dashboard',
                },
                {
                    text: 'Branding',
                    active: true,
                },
            ],
        } as SBRouteData,
    },
];

@NgModule({
    imports: [BrandingModule, RouterModule.forChild(ROUTES)],
    exports: [RouterModule],
})
export class BrandingRoutingModule {}
