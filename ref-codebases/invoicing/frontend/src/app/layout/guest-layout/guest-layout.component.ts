import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { GlobalLoaderComponent } from '../../components/global-loader/global-loader.component';

/**
 * Public / marketing shell: top nav + page content + footer.
 */
@Component({
  selector: 'app-guest-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, GlobalLoaderComponent],
  templateUrl: './guest-layout.component.html',
  styleUrl: './guest-layout.component.css',
})
export class GuestLayoutComponent {}
