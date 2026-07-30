import { Component, DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { StatusBannerComponent } from './status-banner.component';

@Component({
    template: `
        <sb-status-banner></sb-status-banner>
    `,
})
class TestHostComponent {
}

describe('StatusBannerComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let hostComponentDE: DebugElement;
    let hostComponentNE: Element;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [TestHostComponent, StatusBannerComponent],
            imports: [NoopAnimationsModule, HttpClientTestingModule, RouterTestingModule],
            providers: [],
            schemas: [NO_ERRORS_SCHEMA],
        }).compileComponents();

        fixture = TestBed.createComponent(TestHostComponent);
        hostComponentDE = fixture.debugElement;
        hostComponentNE = hostComponentDE.nativeElement;

        fixture.detectChanges();
    });

    it('should display the component', () => {
        expect(hostComponentNE.querySelector('sb-status-banner')).toEqual(jasmine.anything());
    });
});
