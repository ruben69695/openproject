// -- copyright
// OpenProject is a project management system.
// Copyright (C) 2012-2015 the OpenProject Foundation (OPF)
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See doc/COPYRIGHT.rdoc for more details.
// ++
import {Observable, BehaviorSubject} from 'rxjs';
import IDirective = angular.IDirective;
import IScope = angular.IScope;
import {WorkPackagesTableController} from "../../wp-table.directive";
import {
  RenderInfo, timelineElementCssClass, timelineMarkerSelectionStartClass,
  TimelineViewParameters
} from "../wp-timeline";
import {WorkPackageResourceInterface} from "../../../api/api-v3/hal-resources/work-package-resource.service";
import {WpTimelineGlobalService} from "../wp-timeline-global.directive";
import {States} from "../../../states.service";
import {WorkPackageTableTimelineService} from "../../../wp-fast-table/state/wp-table-timeline.service";
import {WorkPackageNotificationService} from "../../../wp-edit/wp-notification.service";
import {WorkPackageRelationsService} from "../../../wp-relations/wp-relations.service";
import {scopeDestroyed$} from "../../../../helpers/angular-rx-utils";
import {WorkPackageTableTimelineVisible} from "../../../wp-fast-table/wp-table-timeline-visible";
import {debugLog} from "../../../../helpers/debug_output";
import {openprojectModule} from "../../../../angular-modules";
import {WorkPackageTimelineHeaderController} from "../header/wp-timeline-header.directive";
import {TypeResource} from "../../../api/api-v3/hal-resources/type-resource.service";

export class WorkPackageTimelineTableController {

  public wpTable: WorkPackagesTableController;

  private _viewParameters: TimelineViewParameters = new TimelineViewParameters();

  private workPackagesInView: {[id: string]: WorkPackageResourceInterface} = {};

  public readonly globalService = new WpTimelineGlobalService(this.$scope);

  private updateAllWorkPackagesSubject = new BehaviorSubject<boolean>(true);

  private refreshViewRequested = false;

  public disableViewParamsCalculation = false;

  public header:WorkPackageTimelineHeaderController;

  private members:{ [name:string]: (vp:TimelineViewParameters) => void } = {};

  constructor(private $scope:IScope,
              private $element:ng.IAugmentedJQuery,
              private TypeResource:any,
              private states:States,
              private wpTableTimeline:WorkPackageTableTimelineService,
              private wpNotificationsService:WorkPackageNotificationService,
              private wpRelations:WorkPackageRelationsService) {

    "ngInject";
  }

  $onInit() {
    // Register this instance to the table
    this.wpTable.registerTimeline(this, this.timelineBody[0]);

    // Refresh timeline view after table rendered
    this.states.table.rendered.values$()
      .take(1)
      .subscribe(() => this.refreshView());

    // Refresh timeline view when becoming visible
    this.states.table.timelineVisible.values$()
      .takeUntil(scopeDestroyed$(this.$scope))
      .subscribe((timelineState:WorkPackageTableTimelineVisible) => {
        if (timelineState.isVisible) {
          this.refreshView();
        }
      });

    // Load the types whenever the timeline is first visible
    // TODO: Load only necessary types from API
    this.states.table.timelineVisible.values$()
      .filter((timelineState) => timelineState.isVisible)
      .take(1)
      .subscribe(() => {
        TypeResource.loadAll().then(() => {
          this.refreshView();
        });
      });
  }

  onRefreshRequested(name:string, callback:(vp:TimelineViewParameters) => void) {
    this.members[name] = callback;
  }


  /**
   * Returns a defensive copy of the currently used view parameters.
   */
  getViewParametersCopy(): TimelineViewParameters {
    return _.cloneDeep(this._viewParameters);
  }

  get viewParameterSettings() {
    return this._viewParameters.settings;
  }

  get timelineBody():ng.IAugmentedJQuery {
    return this.$element.find('.wp-table-timeline--body');
  }

  refreshView() {
    if (!this.wpTableTimeline.isVisible) {
      debugLog('refreshView() requested, but TL is invisible.');
      return;
    }

    if (!this.refreshViewRequested) {
      debugLog('refreshView() in timeline container');
      setTimeout(() => {
        this.calculateViewParams(this._viewParameters);
        this.updateAllWorkPackagesSubject.next(true);
        this.header.refreshView(this._viewParameters);

        _.each(this.members, (cb, key) => {
          debugLog(`Refreshing timeline member ${key}`);
          cb(this._viewParameters);
        });

        this.refreshScrollOnly();
        this.refreshViewRequested = false;
      }, 30);
    }
    this.refreshViewRequested = true;
  }

  refreshScrollOnly() {
    jQuery("." + timelineElementCssClass).css("margin-left", this._viewParameters.scrollOffsetInPx + "px");
  }

  addWorkPackage(wpId: string): Observable<RenderInfo> {
    const wpObs = this.states.workPackages.get(wpId).values$()
      .takeUntil(scopeDestroyed$(this.$scope))
      .map((wp: any) => {
        this.workPackagesInView[wp.id] = wp;
        const viewParamsChanged = this.calculateViewParams(this._viewParameters);
        if (viewParamsChanged) {
          // view params have changed, notify all cells
          this.globalService.updateViewParameter(this._viewParameters);
          this.refreshView();
        }

        return {
          viewParams: this._viewParameters,
          workPackage: wp
        };
      })
      .distinctUntilChanged((v1, v2) => {
        return v1 === v2;
      }, renderInfo => {
        return ""
          + renderInfo.viewParams.dateDisplayStart
          + renderInfo.viewParams.dateDisplayEnd
          + renderInfo.workPackage.date
          + renderInfo.workPackage.startDate
          + renderInfo.workPackage.dueDate;
      });

    return Observable.combineLatest(
        wpObs,
        this.updateAllWorkPackagesSubject,
        (renderInfo: RenderInfo) => {
          return renderInfo;
        }
      );
  }

  startAddRelationPredecessor(start: WorkPackageResourceInterface) {
    this.activateSelectionMode(start.id, end => {
      this.wpRelations
        .addCommonRelation(start as any, "follows", end.id)
        .catch((error:any) => this.wpNotificationsService.handleErrorResponse(error, end));
    });
  }

  startAddRelationFollower(start: WorkPackageResourceInterface) {
    this.activateSelectionMode(start.id, end => {
      this.wpRelations
        .addCommonRelation(start as any, "precedes", end.id)
        .catch((error:any) => this.wpNotificationsService.handleErrorResponse(error, end));
    });
  }

  private activateSelectionMode(start: string, callback: (wp: WorkPackageResourceInterface) => any) {
    start = start.toString(); // old system bug: ID can be a 'number'

    this._viewParameters.activeSelectionMode = (wp: WorkPackageResourceInterface) => {
      callback(wp);

      this._viewParameters.activeSelectionMode = null;
      this._viewParameters.selectionModeStart = null;

      this.$element.removeClass("active-selection-mode");
      jQuery("." + timelineMarkerSelectionStartClass).removeClass(timelineMarkerSelectionStartClass);
      this.refreshView();
    };
    this._viewParameters.selectionModeStart = start;

    this.$element.addClass("active-selection-mode");
    this.refreshView();
  }

  private calculateViewParams(currentParams: TimelineViewParameters): boolean {
    if (this.disableViewParamsCalculation) {
      return false;
    }

    const newParams = new TimelineViewParameters();
    let changed = false;

    // Calculate view parameters
    for (const wpId in this.workPackagesInView) {
      const workPackage = this.workPackagesInView[wpId];

      const startDate = workPackage.startDate ? moment(workPackage.startDate) : currentParams.now;
      const dueDate = workPackage.dueDate ? moment(workPackage.dueDate) : currentParams.now;
      const date = workPackage.date ? moment(workPackage.date) : currentParams.now;

      // start date
      newParams.dateDisplayStart = moment.min(
        newParams.dateDisplayStart,
        currentParams.now,
        startDate,
        date);

      // due date
      newParams.dateDisplayEnd = moment.max(
        newParams.dateDisplayEnd,
        currentParams.now,
        dueDate,
        date);
    }

    // left spacing
    newParams.dateDisplayStart.subtract(3, "days");

    // right spacing
    const headerWidth = this.header.getHeaderWidth();
    const pixelPerDay = currentParams.pixelPerDay;
    const visibleDays = Math.ceil((headerWidth / pixelPerDay) * 1.5);
    newParams.dateDisplayEnd.add(visibleDays, "days");

    // Check if view params changed:

    // start date
    if (!newParams.dateDisplayStart.isSame(this._viewParameters.dateDisplayStart)) {
      changed = true;
      this._viewParameters.dateDisplayStart = newParams.dateDisplayStart;
    }

    // end date
    if (!newParams.dateDisplayEnd.isSame(this._viewParameters.dateDisplayEnd)) {
      changed = true;
      this._viewParameters.dateDisplayEnd = newParams.dateDisplayEnd;
    }


    this._viewParameters.timelineHeader = this.header;

    return changed;
  }
}

openprojectModule.component("wpTimelineContainer", {
  controller: WorkPackageTimelineTableController,
  templateUrl:  '/components/wp-table/timeline/container/wp-timeline-container.html',
  require: {
    wpTable: '^wpTable'
  }
});
