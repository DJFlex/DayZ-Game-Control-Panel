import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ServerInfo, IngameReportEntry } from '../../../app-common/models';
import { AppCommonService } from '../../../app-common/services/app-common.service';
import L, {
    CRS,
    divIcon,
    LatLng,
    layerGroup,
    LayerGroup,
    LeafletKeyboardEvent,
    LeafletMouseEvent,
    Map as LeafletMap,
    MapOptions,
    Marker,
    marker,
    Point,
    PointExpression,
    tileLayer,
    tooltip,
    Tooltip,
    imageOverlay,
    Layer,
} from 'leaflet';
import 'leaflet.markercluster';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EventSpawnsFileWrapper, FileWrapper, MapGroupPosFileWrapper } from 'src/modules/files/containers/types/files';
import { EventSpawn, EventSpawnPos, EventSpawnsXml, MapGroupPosXml } from 'src/modules/files/containers/types/types';

export interface Location {
    name: string;
    cfgName: string;
    position: [number, number];
    type: string;
}

export interface MapInfo {
    tilePattern: string;
    fullImage?: string;
    worldSize: number;

    fullImageMinZoom?: number;
    fullImageMaxZoom?: number;
    maxZoom: number;
    minZoom: number;
    defaultZoom: number;
    attribution: string;
    tileSize: number;
    scale: number;
    center: [number, number];

    preview: string;
    fullSize: string;
    locations: Location[];
    title: string;
    worldName: string;
}

export interface MarkerWithId {
    marker: Marker;
    toolTip?: Tooltip;
    id: string;
    data: any;
}

/* eslint-disable @typescript-eslint/naming-convention */
// eslint-disable-next-line no-shadow
export enum LayerIdsEnum {
    locationLayer = 'locationLayer',
    playerLayer = 'playerLayer',
    vehicleLayer = 'vehicleLayer',
    boatLayer = 'boatLayer',
    airLayer = 'airLayer',
    lootLayer = 'lootLayer',
    eventsLayer = 'eventsLayer',
}
export type LayerIds = keyof typeof LayerIdsEnum;
/* eslint-enable @typescript-eslint/naming-convention */

export class LayerContainer {

    public constructor(
        public label: string,
        public layer: LayerGroup = layerGroup(),
        public markers: MarkerWithId[] = [],
    ) {}

}

/** Which mission file a lazy layer needs before it can show anything. */
export type LazySource = 'loot' | 'events';

export interface LayerPill {
    label: string;
    /** Dot + active border colour. */
    colour: string;
    layerIds: LayerIds[];
    on: boolean;
    /** Layers whose data is only fetched once the pill is first switched on. */
    lazy?: LazySource;
    /** Hide the count when it would be meaningless (locations never change). */
    hideCount?: boolean;
}

@Component({
    selector: 'sb-map',
    templateUrl: './map.component.html',
    styleUrls: ['map.component.scss'],
})
export class MapComponent implements OnInit, OnDestroy {

    protected onDestroy = new Subject();

    public info?: MapInfo;
    public options?: MapOptions;

    public baseLayers?: { [name: string]: Layer };

    public map?: LeafletMap;
    public curZoom?: number;
    public mapScale?: number;
    public curCoordinatesX: number = 0;
    public curCoordinatesY: number = 0;

    protected mapHost: string | any = 'https://mr-guard.de/dayz-maps';
    protected mapName?: string;

    protected layers = new Map<LayerIds, LayerContainer>([
        ['locationLayer', new LayerContainer('Locations')],
        ['playerLayer', new LayerContainer('Players')],
        ['vehicleLayer', new LayerContainer('Vehicles')],
        ['boatLayer', new LayerContainer('Boats')],
        ['airLayer', new LayerContainer('Air')],
        ['lootLayer', new LayerContainer('Loot', L.markerClusterGroup({ spiderfyOnMaxZoom: true }))],
        ['eventsLayer', new LayerContainer('Events', L.markerClusterGroup({ spiderfyOnMaxZoom: true }))],
    ]);

    /**
     * The layer toggles, replacing Leaflet's own layers control (designer frame).
     * Loot and Events are off by default: each needs a mission file that can run
     * to thousands of positions, so it is only fetched when asked for.
     */
    public pills: LayerPill[] = [
        { label: 'Locations', colour: '#57a6ff', layerIds: ['locationLayer'], on: true, hideCount: true },
        { label: 'Players', colour: '#3fb950', layerIds: ['playerLayer'], on: true },
        { label: 'Vehicles', colour: '#ffc107', layerIds: ['vehicleLayer', 'boatLayer', 'airLayer'], on: true },
        { label: 'Loot clusters', colour: '#fd7e14', layerIds: ['lootLayer'], on: false, lazy: 'loot' },
        { label: 'Events', colour: '#d484ff', layerIds: ['eventsLayer'], on: false, lazy: 'events' },
    ];

    private loaded: { [key in LazySource]?: boolean } = {};

    /** Current filter, kept so marker rebuilds can re-apply it. */
    private searchTerm?: string;

    // ---- loot / event editing (was the separate MapLoot page) ---------------

    public files: FileWrapper[] = [];
    public submitting = false;
    public withBackup = false;
    public busy?: string;

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };

    protected selectedEvent?: EventSpawn;

    public constructor(
        public http: HttpClient,
        public appCommon: AppCommonService,
    ) {}

    public ngOnDestroy(): void {
        if (!this.onDestroy.closed) {
            this.onDestroy.next();
            this.onDestroy.complete();
        }
    }

    public ngOnInit(): void {
        this.appCommon.SERVER_INFO
            .asObservable()
            .pipe(
                takeUntil(this.onDestroy),
            )
            .subscribe(
                (x?: ServerInfo) => {
                    if (x?.mapHost) {
                        this.mapHost = x.mapHost;
                    }
                    if (x?.worldName && x.worldName !== this.mapName) {
                        void this.setUpWorld(x.worldName.toLowerCase());
                    }
                },
            );

        this.appCommon.fetchServerInfo().toPromise().then();
    }

    protected createBaseLayers(): void {

        const bounds = this.unproject([this.info!.worldSize, this.info!.worldSize]);

        if (this.info!.fullImage) {
            this.baseLayers = {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Map: imageOverlay(
                    `${this.info!.fullImage}`,
                    [
                        [0, 0],
                        [bounds.lat, bounds.lng],
                    ],
                    {
                        attribution: `Leaflet${this.info!.attribution ? `, ${this.info!.attribution}` : ''}`,
                    },
                ),
            };
        } else {
            this.baseLayers = {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Map: tileLayer(
                    `${this.mapHost}/${this.mapName}/${this.info!.tilePattern ?? 'tiles/{z}/{x}/{y}.png'}`,
                    {
                        attribution: `Leaflet${this.info!.attribution ? `, ${this.info!.attribution}` : ''}`,
                        bounds: [
                            [0, 0],
                            [bounds.lat, bounds.lng],
                        ],
                        maxNativeZoom: this.info!.maxZoom ?? 7,
                        maxZoom: 20,
                    },
                ),
            };
        }

    }

    protected async setUpWorld(name: string): Promise<void> {

        this.mapName = name;

        if (typeof this.mapHost === 'string') {
            const urlBase = `${this.mapHost}/${this.mapName}`;
            this.info = (await this.http.get(
                `${urlBase}/data.json`,
            ).toPromise()) as MapInfo;
        } else {
            this.info = this.mapHost as MapInfo;
        }

        this.mapScale = Math.ceil(
            Math.log(
                this.info!.worldSize / ((this.info!.tileSize ?? 256) / (this.info!.scale ?? 1)),
            ) / Math.log(2),
        );

        this.options = {
            preferCanvas: true,
            doubleClickZoom: false,
            layers: [],
            zoom: this.info.defaultZoom ?? (this.info.minZoom ?? 1),
            center: [0, 0],
            minZoom: Math.min(this.info.minZoom ?? 1, this.info.fullImageMinZoom ?? 1),
            maxZoom: Math.max(this.info.maxZoom ?? 7, this.info.fullImageMaxZoom ?? 20),
            crs: CRS.Simple,
        };
    }

    // ---- layer pills --------------------------------------------------------

    public markerCount(pill: LayerPill): number {
        return pill.layerIds.reduce(
            (n, id) => n + (this.layers.get(id)?.markers.length ?? 0),
            0,
        );
    }

    public async togglePill(pill: LayerPill): Promise<void> {
        pill.on = !pill.on;

        if (pill.on && pill.lazy && !this.loaded[pill.lazy]) {
            await this.loadLazy(pill.lazy);
            if (!this.loaded[pill.lazy]) {
                // the file did not load - do not leave the pill claiming to
                // show a layer that has nothing in it
                pill.on = false;
                return;
            }
        }

        this.applyPill(pill);
    }

    private applyPill(pill: LayerPill): void {
        if (!this.map) {
            return;
        }
        for (const id of pill.layerIds) {
            const container = this.layers.get(id);
            if (!container) {
                continue;
            }
            if (pill.on) {
                this.map.addLayer(container.layer);
            } else {
                this.map.removeLayer(container.layer);
            }
        }
    }

    /** True when a pill needing an editable mission file is showing. */
    public get editing(): boolean {
        return this.pills.some((p) => p.on && !!p.lazy && !!this.loaded[p.lazy]);
    }

    protected project(coords: LatLng): Point {
        return this.map!.project(coords, this.mapScale!);
    }

    protected unproject(coords: PointExpression): LatLng {
        return this.map!.unproject(coords, this.mapScale!);
    }

    protected zoomChange(): void {
        if (!this.map) {
            return;
        }
        const showTooltipAt = 4;
        const newZoom = this.map.getZoom();

        const locationLayer = this.layers.get('locationLayer')!.layer;
        if (newZoom < showTooltipAt && (!this.curZoom || this.curZoom >= showTooltipAt)) {
            locationLayer.eachLayer((l) => {
                l.closeTooltip();
            });
        } else if (newZoom >= showTooltipAt && (!this.curZoom || this.curZoom < showTooltipAt)) {
            locationLayer.eachLayer((l) => {
                if (l.getTooltip) {
                    const toolTip = l.getTooltip();
                    if (toolTip) {
                        locationLayer.addLayer(toolTip);
                    }
                }
            });
        }
        this.curZoom = newZoom;
    }

    /** Drop every marker of a layer, from the map and from our bookkeeping. */
    private clearLayer(id: LayerIds): LayerContainer {
        const container = this.layers.get(id)!;
        container.markers.forEach((x) => container.layer.removeLayer(x.marker));
        container.layer.clearLayers();
        container.markers = [];
        return container;
    }

    protected createLocations(): void {

        const locationLayer = this.clearLayer('locationLayer');

        for (const x of (this.info!.locations || [])) {
            if (x.name) {
                const pos = this.unproject([x.position[0], this.info!.worldSize - x.position[1]]);
                const { name, icon } = this.getLocationTooltip(x);

                const t = tooltip(
                    {
                        permanent: true,
                        direction: 'bottom',
                    },
                ).setContent(name);

                const m = marker(
                    pos,
                    {
                        icon: divIcon({
                            html: `<i class="fa fa-${icon} fa-lg"></i>`,
                            iconSize: [50, 50],
                            className: 'locationIcon',
                        }),
                    },
                ).bindTooltip(t);

                locationLayer.markers.push({
                    marker: m,
                    toolTip: t,
                    id: x.name,
                    data: x,
                });

                locationLayer.layer.addLayer(m);
            }
        }

    }

    public onCenterChange(event: LatLng): void {
        const newPos = this.project(event);
        this.curCoordinatesX = newPos.x;
        this.curCoordinatesY = newPos.y;
    }

    public onMapReady(map: LeafletMap): void {

        this.map = map;

        this.map.on('click', (event: LeafletMouseEvent) => {
            const newPos = this.project(event.latlng);
            this.curCoordinatesX = newPos.x;
            this.curCoordinatesY = newPos.y;
        });
        this.map.on('zoomend', () => this.zoomChange());

        this.createBaseLayers();
        this.map.addLayer(this.baseLayers!['Map']);
        this.map.setView(
            this.unproject(
                this.info!.center ?? (
                    this.info!.worldSize
                    ? [this.info!.worldSize / 2, this.info!.worldSize / 2]
                    : [0, 0]
                ),
            ),
        );

        this.createLocations();

        // only the pills that are on; Leaflet's own layers control is gone
        this.pills.forEach((p) => this.applyPill(p));

        this.zoomChange();

        void this.loadData();
    }

    public zoomIn(): void {
        this.map?.zoomIn();
    }

    public zoomOut(): void {
        this.map?.zoomOut();
    }

    // ---- live data ----------------------------------------------------------

    protected async loadData(): Promise<void> {

        this.appCommon.getApiFetcher('INGAME_PLAYERS').latestData
            .pipe(
                takeUntil(this.onDestroy),
            )
            .subscribe(
                (data) => {
                    if (data) {
                        this.updatePlayers((data as any).value);
                    }
                },
            );

        this.appCommon.getApiFetcher('INGAME_VEHICLES').latestData
            .pipe(
                takeUntil(this.onDestroy),
            )
            .subscribe(
                (data) => {
                    if (data) {
                        this.updateVehicles((data as any).value);
                    }
                },
            );

    }

    /** Fetch the mission file behind a lazy layer, once. */
    protected async loadLazy(which: LazySource): Promise<void> {
        this.busy = which === 'loot' ? 'Loading loot positions…' : 'Loading event spawns…';
        try {
            if (which === 'events') {
                const eventSpawns = new EventSpawnsFileWrapper('cfgeventspawns.xml');
                await eventSpawns.parse(await this.appCommon.fetchMissionFile(eventSpawns.file).toPromise());
                this.files = [...this.files.filter((f) => f.file !== eventSpawns.file), eventSpawns];
                this.updateEvents(eventSpawns.content);
            } else {
                const mapGrpPos = new MapGroupPosFileWrapper('mapgrouppos.xml');
                await mapGrpPos.parse(await this.appCommon.fetchMissionFile(mapGrpPos.file).toPromise());
                this.files = [...this.files.filter((f) => f.file !== mapGrpPos.file), mapGrpPos];
                this.updateMapGrpPos(mapGrpPos.content);
            }
            this.loaded[which] = true;
        } catch (e) {
            console.error(`Failed to load ${which}`, e);
            // leave loaded[] false so switching the pill on again retries
            this.outcomeBadge = {
                success: false,
                message: which === 'events'
                    ? 'Failed to load cfgeventspawns.xml'
                    : 'Failed to load mapgrouppos.xml',
            };
        }
        this.busy = undefined;
    }

    /** Re-read whichever mission files are currently loaded, dropping edits. */
    public async reloadFiles(): Promise<void> {
        if (!confirm('Discard unsaved marker changes and reload from the server?')) {
            return;
        }
        const wanted = (Object.keys(this.loaded) as LazySource[]).filter((k) => this.loaded[k]);
        this.files = [];
        wanted.forEach((k) => {
            this.loaded[k] = false;
            this.clearLayer(k === 'loot' ? 'lootLayer' : 'eventsLayer');
        });
        for (const k of wanted) {
            await this.loadLazy(k);
        }
    }

    protected getLocationTooltip(x: Location): { name: string; icon: string } {
        let icon = 'city';
        switch (x.type.toLowerCase()) {
            case 'marine': {
                icon = 'anchor';
                break;
            }
            case 'ruin': {
                icon = 'chess-rook';
                break;
            }
            case 'mount':
            case 'hill': {
                icon = 'mountain';
                break;
            }
            case 'camp': {
                icon = 'campground';
                break;
            }
            case 'local':
            case 'village': {
                icon = 'home';
                break;
            }
            case 'capital': {
                icon = 'university';
                break;
            }
            case 'settlement':
            default: {
                icon = 'city';
                break;
            }
        }

        if (x.cfgName) {
            let detail = x.cfgName;

            if (x.cfgName.includes('_')) {
                const nameSplits = x.cfgName.split('_').filter((part) => !!part);

                if (['local', 'settlement', 'marine', 'ruin', 'camp', 'hill'].includes(nameSplits[0].toLowerCase())) {
                    nameSplits.splice(0, 1);
                }

                detail = nameSplits.join(' ');
                if (detail.startsWith('AF')) {
                    icon = 'plane';
                } else if (detail.startsWith('MB')) {
                    icon = 'crosshairs';
                }
            }

            return {
                name: `${x.name}\n<small>(${detail})</small>`,
                icon,
            };
        }

        return {
            name: x.name,
            icon,
        };
    }

    /**
     * Rebuilt from scratch each refresh. The previous version pushed a fresh
     * marker per entity per poll while only ever removing the ones that had
     * gone, so markers stacked up on the map and `markers` grew without bound.
     */
    protected updatePlayers(players: IngameReportEntry[]): void {
        const layer = this.clearLayer('playerLayer');

        for (const x of players) {

            const pos = x.position.split(' ').map((coord) => Number(coord));
            const t = tooltip(
                {
                    permanent: true,
                    direction: 'bottom',
                },
            ).setContent(x.name);

            const m = marker(
                this.unproject([pos[0], this.info!.worldSize - pos[2]]),
                {
                    icon: divIcon({
                        html: `<i class="fa fa-user fa-lg" style="color: lime"></i>`,
                        iconSize: [50, 50],
                        className: 'locationIcon',
                    }),
                },
            ).bindTooltip(t);

            layer.markers.push({
                marker: m,
                toolTip: t,
                id: String(x.id),
                data: x,
            });

            layer.layer.addLayer(m);
        }

        this.applySearch();
    }

    protected updateVehicles(vehicles: IngameReportEntry[]): void {
        const layerGround = this.clearLayer('vehicleLayer');
        const layerAir = this.clearLayer('airLayer');
        const layerSea = this.clearLayer('boatLayer');

        for (const x of vehicles) {

            const pos = x.position.split(' ').map((coord) => Number(coord));
            const t = tooltip(
                {
                    permanent: true,
                    direction: 'bottom',
                },
            ).setContent(x.type);

            let layer: LayerContainer = layerGround;
            let iconClass: string = 'fa fa-car fa-lg';

            if (x.category === 'AIR') {
                layer = layerAir;
                iconClass = 'fa fa-helicopter fa-lg';
            } else if (x.category === 'SEA') {
                layer = layerSea;
                iconClass = 'fa fa-ship fa-lg';
            }

            const m = marker(
                this.unproject([pos[0], this.info!.worldSize - pos[2]]),
                {
                    icon: divIcon({
                        html: `<i class="${iconClass}" style="color: yellow"></i>`,
                        iconSize: [50, 50],
                        className: 'locationIcon',
                    }),
                },
            ).bindTooltip(t);

            layer.markers.push({
                marker: m,
                toolTip: t,
                id: String(x.id),
                data: x,
            });
            layer.layer.addLayer(m);
        }

        this.applySearch();
    }

    // ---- events + loot (editable) ------------------------------------------

    protected createEventMarker(event: EventSpawn, eventPos: EventSpawnPos): void {
        const layer = this.layers.get('eventsLayer')!;

        const pos = [Number(eventPos.$.x), Number(eventPos.$.y || '0'), Number(eventPos.$.z)];
        const t = tooltip(
            {
                permanent: true,
                direction: 'bottom',
            },
        ).setContent(event.$.name);

        const m = marker(
            this.unproject([pos[0], this.info!.worldSize - pos[2]]),
            {
                draggable: true,
                interactive: true,
                icon: divIcon({
                    html: `<i class="fa fa-warn fa-lg"></i>`,
                    iconSize: [50, 50],
                    className: 'locationIcon',
                }),
            },
        )
            .bindTooltip(t)
            .addEventListener('dragend', () => {
                const newPos = this.project(m.getLatLng());

                eventPos.$.x = String(newPos.x);
                eventPos.$.z = String(Math.abs(newPos.y - this.info!.worldSize));
            })
            .addEventListener('keyup', (e: LeafletKeyboardEvent) => {
                if (e.originalEvent.key === 'Delete') {
                    event.pos!.splice(event.pos!.indexOf(eventPos), 1);
                    layer.layer.removeLayer(m);
                    layer.markers = layer.markers.filter((x) => x.marker !== m);
                }
            })
            .addEventListener('dblclick', () => {
                this.selectedEvent = event;
            })
        ;

        layer.markers.push({
            marker: m,
            toolTip: t,
            id: String(event.$.name),
            data: eventPos,
        });

        layer.layer.addLayer(m);
    }

    protected updateEvents(eventSpawns: EventSpawnsXml): void {
        for (const event of eventSpawns.eventposdef.event) {

            if (!event.pos) continue;

            for (const eventSpawn of event.pos) {
                this.createEventMarker(event, eventSpawn);
            }

        }
    }

    protected updateMapGrpPos(mapGrpPos: MapGroupPosXml): void {
        const layer = this.layers.get('lootLayer')!;

        for (const group of mapGrpPos.map.group) {

            if (!group.$.pos) continue;

            const pos = group.$.pos.split(' ').map((x) => Number(x));
            const t = tooltip(
                {
                    permanent: true,
                    direction: 'bottom',
                },
            ).setContent(group.$.name);

            const m = marker(
                this.unproject([pos[0], this.info!.worldSize - pos[2]]),
                {
                    interactive: true,
                    icon: divIcon({
                        html: `<i class="fa fa-warn fa-lg"></i>`,
                        iconSize: [50, 50],
                        className: 'locationIcon',
                    }),
                },
            )
                .bindTooltip(t)
                .addEventListener('keyup', (e: LeafletKeyboardEvent) => {
                    if (e.originalEvent.key === 'Delete') {
                        mapGrpPos.map.group.splice(mapGrpPos.map.group.indexOf(group), 1);
                        layer.layer.removeLayer(m);
                        layer.markers = layer.markers.filter((x) => x.marker !== m);
                    }
                })
            ;

            layer.markers.push({
                marker: m,
                toolTip: t,
                id: String(group.$.name),
                data: group,
            });

            layer.layer.addLayer(m);

        }
    }

    /** Double-click drops another position for the event you last picked. */
    public onMapDoubleClick(event: LeafletMouseEvent): void {
        if (this.selectedEvent?.pos) {
            const pt = this.project(event.latlng);
            const pos: EventSpawnPos = {
                $: {
                    x: String(pt.x),
                    z: String(Math.abs(pt.y - this.info!.worldSize)),
                    a: '0',
                },
            };

            this.selectedEvent.pos.push(pos);
            this.createEventMarker(this.selectedEvent, pos);
        }
    }

    public get selectedEventName(): string | undefined {
        return this.selectedEvent?.$?.name;
    }

    public clearSelectedEvent(): void {
        this.selectedEvent = undefined;
    }

    // ---- search -------------------------------------------------------------

    /**
     * Matches live entities on name/type and file-backed markers on their id,
     * so one box covers players, vehicles, loot groups and event spawns.
     */
    public search(value?: string): void {
        this.searchTerm = value?.trim().toLowerCase() || undefined;
        this.applySearch();
    }

    /**
     * Re-applied after every marker rebuild: the player and vehicle layers are
     * recreated on each poll, which would otherwise silently drop an active
     * filter a few seconds after it was typed.
     */
    private applySearch(): void {
        const term = this.searchTerm;

        const searchable: LayerIds[] = [
            'playerLayer', 'vehicleLayer', 'airLayer', 'boatLayer', 'lootLayer', 'eventsLayer',
        ];

        for (const id of searchable) {
            const container = this.layers.get(id);
            if (!container) {
                continue;
            }
            for (const m of container.markers) {
                const data = m.data as IngameReportEntry;
                const hasMarker = container.layer.hasLayer(m.marker);
                const shouldHave = !term
                    || !!m.id?.toLowerCase().includes(term)
                    || !!data?.name?.toLowerCase().includes(term)
                    || !!data?.type?.toLowerCase().includes(term);

                if (hasMarker && !shouldHave) {
                    container.layer.removeLayer(m.marker);
                }

                if (!hasMarker && shouldHave) {
                    container.layer.addLayer(m.marker);
                }
            }
        }
    }

    // ---- saving -------------------------------------------------------------

    protected async saveFiles(): Promise<void> {
        for (const file of this.files) {
            if (file.skipSave) continue;
            const fileContent = file.strinigfy();
            if (file.location === 'mission') {
                await this.appCommon.updateMissionFile(
                    file.file,
                    fileContent,
                    this.withBackup,
                ).toPromise();
            } else {
                await this.appCommon.updateProfileFile(
                    (file as any).file, // TODO remove when profile files get saveable
                    fileContent,
                    this.withBackup,
                ).toPromise();
            }
        }
    }

    public async onSubmit(): Promise<void> {
        if (!this.files.length) {
            return;
        }
        const names = this.files.map((f) => f.file).join(', ');
        if (!confirm(`Write ${names} back to the server?`)) {
            return;
        }
        if (this.submitting) return;
        this.submitting = true;
        this.outcomeBadge = undefined;

        try {
            await this.saveFiles();
            this.outcomeBadge = {
                success: true,
                message: `Saved ${names}`,
            };
        } catch (e: any) {
            console.error(e);
            this.outcomeBadge = {
                success: false,
                message: `Failed to save: ${e.message}`,
            };
        }

        this.submitting = false;
    }

}
