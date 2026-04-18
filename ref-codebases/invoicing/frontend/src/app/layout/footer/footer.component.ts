import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

const SITE_NAME = 'Axis Solutions';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  protected readonly siteName = SITE_NAME;
  protected readonly year = new Date().getFullYear();
}
