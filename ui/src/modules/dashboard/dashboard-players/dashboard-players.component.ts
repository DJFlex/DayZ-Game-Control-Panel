import { Component, OnInit } from '@angular/core';
import { PlayersService } from '../../players/services/players.service';

@Component({
    selector: 'sb-dashboard-players',
    templateUrl: './dashboard-players.component.html',
    styleUrls: ['dashboard-players.component.scss'],
})
export class DashboardPlayersComponent implements OnInit {

    public constructor(
        public playerService: PlayersService,
    ) {}

    public ngOnInit(): void {
        // ignore
    }

}
