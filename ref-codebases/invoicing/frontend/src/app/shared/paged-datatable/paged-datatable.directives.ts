import { Directive, TemplateRef } from '@angular/core';

/** Mark the header row template: `<ng-template pagedDataTableHeader><tr>...</tr></ng-template>` */
@Directive({
  selector: 'ng-template[pagedDataTableHeader]',
  standalone: true,
})
export class PagedDataTableHeaderTemplate {
  constructor(public templateRef: TemplateRef<unknown>) {}
}

/** Mark the body row template: `<ng-template pagedDataTableBody let-row><tr>...</tr></ng-template>` */
@Directive({
  selector: 'ng-template[pagedDataTableBody]',
  standalone: true,
})
export class PagedDataTableBodyTemplate {
  constructor(public templateRef: TemplateRef<unknown>) {}
}

/** Optional empty state (full `<tr>` markup including `<td colspan="...">`). */
@Directive({
  selector: 'ng-template[pagedDataTableEmpty]',
  standalone: true,
})
export class PagedDataTableEmptyTemplate {
  constructor(public templateRef: TemplateRef<unknown>) {}
}
