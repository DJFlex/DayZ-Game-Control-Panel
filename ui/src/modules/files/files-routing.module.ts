/* tslint:disable: ordered-imports*/
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

/* Module */
import { FilesModule } from './files.module';

/* Containers */
import { SBRouteData } from '../navigation/models';
import { TypesComponent } from './containers/types/types.component';
import { FileEditorComponent } from './containers/file-editor/file-editor.component';

/* Routes */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ROUTES: Routes = [
    {
        path: '',
        pathMatch: 'full',
        redirectTo: 'types',
    },
    {
        path: 'types',
        canActivate: [],
        component: TypesComponent,
        data: {
            title: 'Files',
            breadcrumbs: [
                {
                    text: 'Dashboard',
                    link: '/dashboard',
                },
                {
                    text: 'Files',
                    link: '/files',
                },
                {
                    text: 'Types',
                    active: true,
                },
            ],
        } as SBRouteData,
    },
    {
        path: 'editor',
        canActivate: [],
        component: FileEditorComponent,
        data: {
            title: 'File Editor',
            breadcrumbs: [
                {
                    text: 'Dashboard',
                    link: '/dashboard',
                },
                {
                    text: 'Files',
                    link: '/files',
                },
                {
                    text: 'File Editor',
                    active: true,
                },
            ],
        } as SBRouteData,
    },
    {
        path: '**',
        pathMatch: 'full',
        redirectTo: 'types',
    },
];

@NgModule({
    imports: [FilesModule, RouterModule.forChild(ROUTES)],
    exports: [RouterModule],
})
export class FilesRoutingModule {}
