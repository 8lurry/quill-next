import type {
  CDPSession,
  Page,
  PlaywrightWorkerOptions,
} from '@playwright/test';

abstract class CompositionSession {
  abstract update(key: string): Promise<void>;
  abstract commit(committedText: string): Promise<void>;

  protected composingData = '';
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  protected async withKeyboardEvents(
    key: string,
    callback: () => Promise<void>,
  ) {
    const activeElement = this.page.locator('*:focus');

    await activeElement.dispatchEvent('keydown', { key });
    await callback();
    await activeElement.dispatchEvent('keyup', { key });
  }
}

class ChromiumCompositionSession extends CompositionSession {
  private session: CDPSession;

  constructor(
    page: Page,
    session: CDPSession,
  ) {
    super(page);
    this.session = session;
  }

  async update(key: string) {
    await this.withKeyboardEvents(key, async () => {
      this.composingData += key;

      await this.session.send('Input.imeSetComposition', {
        selectionStart: this.composingData.length,
        selectionEnd: this.composingData.length,
        text: this.composingData,
      });
    });
  }

  async commit(committedText: string) {
    await this.withKeyboardEvents('Space', async () => {
      await this.session.send('Input.insertText', {
        text: committedText,
      });
    });
  }
}

class Composition {
  private page: Page;
  private browserName: PlaywrightWorkerOptions['browserName'];

  constructor(
    page: Page,
    browserName: PlaywrightWorkerOptions['browserName'],
  ) {
    this.page = page;
    this.browserName = browserName;
  }

  async start() {
    switch (this.browserName) {
      case 'chromium': {
        const session = await this.page.context().newCDPSession(this.page);
        return new ChromiumCompositionSession(this.page, session);
      }
      default:
        throw new Error(`Unsupported browser: ${this.browserName}`);
    }
  }
}

export default Composition;
