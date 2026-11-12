/* tslint:disable: ordered-imports*/
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/* Modules */
import { AppCommonModule } from '../app-common/app-common.module';
import { NavigationModule } from '../navigation/navigation.module';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { MapsComponent } from './containers/maps/maps.component';

@NgModule({
    imports: [
        CommonModule,
        RouterModule,
        AppCommonModule,
        NavigationModule,
        FontAwesomeModule,
    ],
    declarations: [
        MapsComponent,
    ],
    exports: [
        MapsComponent,
    ],
})
export class MapsModule {}
