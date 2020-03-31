/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  NgZone,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import {take} from 'rxjs/operators';

/**
 * Extra CSS classes that can be associated with a calendar cell.
 */
export type MatCalendarCellCssClasses = string | string[] | Set<string> | {[key: string]: any};

/**
 * An internal class that represents the data corresponding to a single calendar cell.
 * @docs-private
 */
export class MatCalendarCell {
  constructor(public value: number,
              public displayValue: string,
              public ariaLabel: string,
              public enabled: boolean,
              public cssClasses: MatCalendarCellCssClasses = {},
              public compareValue = value) {}
}


/**
 * An internal component used to display calendar data in a table.
 * @docs-private
 */
@Component({
  selector: '[mat-calendar-body]',
  templateUrl: 'calendar-body.html',
  styleUrls: ['calendar-body.css'],
  host: {
    'class': 'mat-calendar-body',
    'role': 'grid',
    'aria-readonly': 'true'
  },
  exportAs: 'matCalendarBody',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatCalendarBody implements OnChanges, OnDestroy {
  /** The label for the table. (e.g. "Jan 2017"). */
  @Input() label: string;

  /** The cells to display in the table. */
  @Input() rows: MatCalendarCell[][];

  /** The value in the table that corresponds to today. */
  @Input() todayValue: number;

  /** Start value of the selected date range. */
  @Input() startValue: number;

  /** End value of the selected date range. */
  @Input() endValue: number;

  /** The minimum number of free cells needed to fit the label in the first row. */
  @Input() labelMinRequiredCells: number;

  /** The number of columns in the table. */
  @Input() numCols: number = 7;

  /** The cell number of the active cell in the table. */
  @Input() activeCell: number = 0;

  /**
   * The aspect ratio (width / height) to use for the cells in the table. This aspect ratio will be
   * maintained even as the table resizes.
   */
  @Input() cellAspectRatio: number = 1;

  /** Start of the comparison range. */
  @Input() comparisonStart: number | null;

  /** End of the comparison range. */
  @Input() comparisonEnd: number | null;

  /** Emits when a new value is selected. */
  @Output() readonly selectedValueChange: EventEmitter<number> = new EventEmitter<number>();

  /** The number of blank cells to put at the beginning for the first row. */
  _firstRowOffset: number;

  /** Padding for the individual date cells. */
  _cellPadding: string;

  /** Width of an individual cell. */
  _cellWidth: string;

  /**
   * Value that the user is either currently hovering over or is focusing
   * using the keyboard. Only applies when selecting the end of a date range.
   */
  _previewEnd = -1;

  constructor(
    private _elementRef: ElementRef<HTMLElement>,
    private _changeDetectorRef: ChangeDetectorRef,
    private _ngZone: NgZone) {

    _ngZone.runOutsideAngular(() => {
      const element = _elementRef.nativeElement;
      element.addEventListener('mouseenter', this._enterHandler, true);
      element.addEventListener('focus', this._enterHandler, true);
      element.addEventListener('mouseleave', this._leaveHandler, true);
      element.addEventListener('blur', this._leaveHandler, true);
    });
  }

  /** Called when a cell is clicked. */
  _cellClicked(cell: MatCalendarCell): void {
    if (cell.enabled) {
      this.selectedValueChange.emit(cell.value);
    }
  }

  /** Returns whether a cell should be marked as selected. */
  _isSelected(cell: MatCalendarCell) {
    return this.startValue === cell.compareValue || this.endValue === cell.compareValue;
  }

  ngOnChanges(changes: SimpleChanges) {
    const columnChanges = changes['numCols'];
    const {rows, numCols} = this;

    if (changes['rows'] || columnChanges) {
      this._firstRowOffset = rows && rows.length && rows[0].length ? numCols - rows[0].length : 0;
    }

    if (changes['cellAspectRatio'] || columnChanges || !this._cellPadding) {
      this._cellPadding = `${50 * this.cellAspectRatio / numCols}%`;
    }

    if (columnChanges || !this._cellWidth) {
      this._cellWidth = `${100 / numCols}%`;
    }

    if (changes['startValue'] || changes['endValue']) {
      this._previewEnd = -1;
    }
  }

  ngOnDestroy() {
    const element = this._elementRef.nativeElement;
    element.removeEventListener('mouseenter', this._enterHandler, true);
    element.removeEventListener('focus', this._enterHandler, true);
    element.removeEventListener('mouseleave', this._leaveHandler, true);
    element.removeEventListener('blur', this._leaveHandler, true);
  }

  /** Returns whether a cell is active. */
  _isActiveCell(rowIndex: number, colIndex: number): boolean {
    let cellNumber = rowIndex * this.numCols + colIndex;

    // Account for the fact that the first row may not have as many cells.
    if (rowIndex) {
      cellNumber -= this._firstRowOffset;
    }

    return cellNumber == this.activeCell;
  }

  /** Focuses the active cell after the microtask queue is empty. */
  _focusActiveCell() {
    this._ngZone.runOutsideAngular(() => {
      this._ngZone.onStable.asObservable().pipe(take(1)).subscribe(() => {
        const activeCell: HTMLElement | null =
            this._elementRef.nativeElement.querySelector('.mat-calendar-body-active');

        if (activeCell) {
          activeCell.focus();
        }
      });
    });
  }

  /** Gets whether the calendar is currently selecting a range. */
  _isSelectingRange(): boolean {
    return this.startValue !== this.endValue;
  }

  /** Gets whether a value is the start of the main range. */
  _isRangeStart(value: number) {
    return value === this.startValue;
  }

  /** Gets whether a value is the end of the main range. */
  _isRangeEnd(value: number) {
    return this.startValue && value >= this.startValue && value === this.endValue;
  }

  /** Gets whether a value is within the currently-selected range. */
  _isInRange(value: number): boolean {
    return this._isSelectingRange() && value >= this.startValue && value <= this.endValue;
  }

  /** Gets whether a value is the start of the comparison range. */
  _isComparisonStart(value: number) {
    return value === this.comparisonStart;
  }

  /** Whether the cell is a start bridge cell between the main and comparison ranges. */
  _isComparisonBridgeStart(value: number, rowIndex: number, colIndex: number) {
    if (!this._isComparisonStart(value) || this._isRangeStart(value) || !this._isInRange(value)) {
      return false;
    }

    let previousCell: MatCalendarCell | undefined = this.rows[rowIndex][colIndex - 1];

    if (!previousCell) {
      const previousRow = this.rows[rowIndex - 1];
      previousCell = previousRow && previousRow[previousRow.length - 1];
    }

    return previousCell && !this._isRangeEnd(previousCell.compareValue);
  }

  /** Whether the cell is an end bridge cell between the main and comparison ranges. */
  _isComparisonBridgeEnd(value: number, rowIndex: number, colIndex: number) {
    if (!this._isComparisonEnd(value) || this._isRangeEnd(value) || !this._isInRange(value)) {
      return false;
    }

    let nextCell: MatCalendarCell | undefined = this.rows[rowIndex][colIndex + 1];

    if (!nextCell) {
      const nextRow = this.rows[rowIndex + 1];
      nextCell = nextRow && nextRow[0];
    }

    return nextCell && !this._isRangeStart(nextCell.compareValue);
  }

  /** Gets whether a value is the end of the comparison range. */
  _isComparisonEnd(value: number) {
    return this.comparisonStart && value >= this.comparisonStart &&
           value === this.comparisonEnd;
  }

  /** Gets whether a value is within the current comparison range. */
  _isInComparisonRange(value: number) {
    return this.comparisonStart && this.comparisonEnd &&
           value >= this.comparisonStart &&
           value <= this.comparisonEnd;
  }

  /** Gets whether a value is the start of the preview range. */
  _isPreviewStart(value: number) {
    return this._previewEnd > -1 && this._isRangeStart(value);
  }

  /** Gets whether a value is the end of the preview range. */
  _isPreviewEnd(value: number) {
    return value === this._previewEnd;
  }

  /** Gets whether a value is inside the preview range. */
  _isInPreview(value: number) {
    return this._isSelectingRange() && value >= this.startValue && value <= this._previewEnd;
  }

  /**
   * Event handler for when the user enters an element
   * inside the calendar body (e.g. by hovering in or focus).
   */
  private _enterHandler = (event: Event) => {
    // We only need to hit the zone when we're selecting a range, we have a
    // start value without an end value and we've hovered over a date cell.
    if (!event.target || !this.startValue || this.endValue || !this._isSelectingRange()) {
      return;
    }

    const cell = this._getCellFromElement(event.target as HTMLElement);

    if (cell) {
      const value = cell.compareValue;

      // Only set as the preview end value if we're after the start of the range.
      const previewEnd = (cell.enabled && value > this.startValue) ? value : -1;

      if (previewEnd !== this._previewEnd) {
        this._previewEnd = previewEnd;
        this._ngZone.run(() => this._changeDetectorRef.markForCheck());
      }
    }
  }

  /**
   * Event handler for when the user's pointer leaves an element
   * inside the calendar body (e.g. by hovering out or blurring).
   */
  private _leaveHandler = (event: Event) => {
    // We only need to hit the zone when we're selecting a range.
    if (this._previewEnd !== -1 && this._isSelectingRange()) {
      // Only reset the preview end value when leaving cells. This looks better, because
      // we have a gap between the cells and the rows and we don't want to remove the
      // range just for it to show up again when the user moves a few pixels to the side.
      if (event.target && isTableCell(event.target as HTMLElement)) {
        this._ngZone.run(() => {
          this._previewEnd = -1;

          // Note that here we need to use `detectChanges`, rather than `markForCheck`, because
          // the way `_focusActiveCell` is set up at the moment makes it fire at the wrong time
          // when navigating one month back using the keyboard which will cause this handler
          // to throw a "changed after checked" error when updating the preview state.
          this._changeDetectorRef.detectChanges();
        });
      }
    }
  }

  /** Finds the MatCalendarCell that corresponds to a DOM node. */
  private _getCellFromElement(element: HTMLElement): MatCalendarCell | null {
    let cell: HTMLElement | undefined;

    if (isTableCell(element)) {
      cell = element;
    } else if (isTableCell(element.parentNode!)) {
      cell = element.parentNode as HTMLElement;
    }

    if (cell) {
      const row = cell.getAttribute('data-mat-row');
      const col = cell.getAttribute('data-mat-col');

      if (row && col) {
        return this.rows[parseInt(row)][parseInt(col)];
      }
    }

    return null;
  }

}

/** Checks whether a node is a table cell element. */
function isTableCell(node: Node): node is HTMLTableCellElement {
  return node.nodeName === 'TD';
}
