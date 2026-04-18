import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

const SITE_NAME = 'E-Invoicing';

@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.css',
})
export class GuideComponent {
  protected readonly siteName = SITE_NAME;
}
