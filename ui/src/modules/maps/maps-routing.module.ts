/* tslint:disable: ordered-imports*/
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

/* Module */
import { MapsModule } from './maps.module';

import { SBRouteData } from '../navigation/models';
import { MapsComponent } from './containers/maps/maps.component';

/* Routes */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ROUTES: Routes = [
    {
        path: '',
        canActivate: [],
        component: MapsComponent,
        data: {
            title: 'Maps',
            breadcrumbs: [
                {
                    text: 'Dashboard',
                    link: '/dashboard',
                },
                {
                    text: 'Maps',
                    active: true,
                },
            ],
        } as SBRouteData,
    },
];

@NgModule({
    imports: [MapsModule, RouterModule.forChild(ROUTES)],
    exports: [RouterModule],
})
export class MapsRoutingModule {}
