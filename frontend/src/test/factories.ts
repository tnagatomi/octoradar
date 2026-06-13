// Builders for the Wails model objects the UI renders. Each takes partial
// overrides on top of a sensible default so a test only states the fields it
// cares about.
import {discover, feed, main, notifications} from '../../wailsjs/go/models';

let seq = 0;

// A feed item. `createdAt` defaults to a fixed instant well in the past so
// relativeTime() renders deterministically; pass an override when a test asserts
// on the timestamp.
export function makeItem(overrides: Partial<feed.Item> = {}): feed.Item {
    seq += 1;
    return feed.Item.createFrom({
        id: `item-${seq}`,
        actor: 'octocat',
        avatarUrl: 'https://example.test/octocat.png',
        type: 'WatchEvent',
        action: 'starred',
        target: 'octocat/hello-world',
        targetUrl: 'https://github.com/octocat/hello-world',
        trailer: '',
        createdAt: '2020-01-01T00:00:00Z',
        ...overrides,
    });
}

export function makeRepository(overrides: Partial<discover.Repository> = {}): discover.Repository {
    seq += 1;
    return discover.Repository.createFrom({
        fullName: `octocat/repo-${seq}`,
        description: 'A delightful repository',
        language: 'Go',
        stars: 1234,
        forks: 56,
        url: `https://github.com/octocat/repo-${seq}`,
        ownerLogin: 'octocat',
        ownerAvatarUrl: 'https://example.test/octocat.png',
        ...overrides,
    });
}

export function makeFeedResult(overrides: Partial<feed.Result> = {}): feed.Result {
    return feed.Result.createFrom({
        items: [],
        errors: [],
        unauthorized: false,
        ...overrides,
    });
}

export function makeDiscoverResult(overrides: Partial<discover.Result> = {}): discover.Result {
    return discover.Result.createFrom({
        repositories: [],
        errors: [],
        unauthorized: false,
        ...overrides,
    });
}

// A reaction item: someone starred or forked one of the user's repos.
export function makeReactionItem(overrides: Partial<notifications.Item> = {}): notifications.Item {
    seq += 1;
    return notifications.Item.createFrom({
        id: `reaction-${seq}`,
        actor: 'mona',
        avatarUrl: 'https://example.test/mona.png',
        type: 'WatchEvent',
        action: 'starred',
        target: 'octocat/hello-world',
        targetUrl: 'https://github.com/octocat/hello-world',
        trailer: '',
        createdAt: '2020-01-01T00:00:00Z',
        ...overrides,
    });
}

export function makeReactionsResult(overrides: Partial<notifications.Result> = {}): notifications.Result {
    return notifications.Result.createFrom({
        items: [],
        errors: [],
        unauthorized: false,
        unreadCount: 0,
        ...overrides,
    });
}

export function makeSettings(overrides: Partial<main.Settings> = {}): main.Settings {
    return main.Settings.createFrom({
        hasToken: true,
        login: 'octocat',
        users: ['octocat'],
        ...overrides,
    });
}
