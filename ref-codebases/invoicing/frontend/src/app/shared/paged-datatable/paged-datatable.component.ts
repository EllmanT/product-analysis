import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  contentChild,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table';
import {
  PagedDataTableBodyTemplate,
  PagedDataTableEmptyTemplate,
  PagedDataTableHeaderTemplate,
} from './paged-datatable.directives';

/**
 * Reusable PrimeNG table with pagination.
 * - **Server-side:** set `lazy` to `true`, bind `totalRecords`, handle `lazyLoad`, pass one page of `value`.
 * - **Client-side:** leave `lazy` `false`, pass full `value`; paginator slices locally.
 */
@Component({
  selector: 'app-paged-datatable',
  standalone: true,
  imports: [TableModule, NgTemplateOutlet, FormsModule, InputTextModule, ButtonModule],
  templateUrl: './paged-datatable.component.html',
  styleUrl: './paged-datatable.component.css',
})
export class PagedDataTableComponent {
  private readonly dt = viewChild<Table>('dt');

  readonly headerTpl = contentChild.required(PagedDataTableHeaderTemplate);
  readonly bodyTpl = contentChild.required(PagedDataTableBodyTemplate);
  readonly emptyTpl = contentChild(PagedDataTableEmptyTemplate);

  /** Row data: full list (client mode) or current page (lazy mode). */
  value = input.required<unknown[]>();
  loading = input(false);
  /** When true, use `totalRecords` and emit `lazyLoad` for each page change. */
  lazy = input(false);
  /** Required when `lazy` is true. Ignored for client-side mode. */
  totalRecords = input(0);
  rows = input(15);
  rowsPerPageOptions = input<number[]>([15, 25, 50]);
  paginator = input(true);
  showCurrentPageReport = input(false);
  currentPageReportTemplate = input<string>('Showing {first} to {last} of {totalRecords} entries');
  /** Extra classes appended to defaults (e.g. `p-datatable-sm`). */
  styleClass = input<string>('');
  tableStyle = input<Record<string, string>>({});
  striped = input(true);
  /** Show a built-in global search input. */
  enableSearch = input(true);
  searchPlaceholder = input('Search...');
  /** Show built-in CSV export button. */
  enableExport = input(true);
  exportFileName = input('table-export');

  /** Default empty row when no `pagedDataTableEmpty` template is provided. */
  emptyMessage = input('No records found.');
  emptyColspan = input(1);

  lazyLoad = output<TableLazyLoadEvent>();
  searchChange = output<string>();

  searchTerm = '';

  readonly effectiveTotalRecords = computed(() =>
    this.lazy() ? this.totalRecords() : this.value().length
  );

  readonly mergedStyleClass = computed(() => {
    const parts: string[] = [];
    if (this.striped()) {
      parts.push('p-datatable-striped');
    }
    const extra = this.styleClass().trim();
    if (extra) {
      parts.push(extra);
    }
    return parts.join(' ');
  });

  onLazyLoadHandler(event: TableLazyLoadEvent): void {
    if (this.lazy()) {
      this.lazyLoad.emit(event);
    }
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    if (this.lazy()) {
      this.searchChange.emit(value.trim());
      this.dt()?.reset();
      return;
    }
    this.dt()?.filterGlobal(value, 'contains');
  }

  exportCsv(): void {
    this.dt()?.exportCSV();
  }

  /** Reset to first page (e.g. after filter change). Triggers `lazyLoad` when `lazy` is true. */
  reset(): void {
    this.dt()?.reset();
  }
}
