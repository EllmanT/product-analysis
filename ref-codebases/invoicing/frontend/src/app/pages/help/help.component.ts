import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

const SITE_NAME = 'E-Invoicing';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './help.component.html',
  styleUrl: './help.component.css',
})
export class HelpComponent {
  protected readonly siteName = SITE_NAME;
}
