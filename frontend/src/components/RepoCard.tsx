import {discover} from '../../wailsjs/go/models';
import {ExternalLink} from './ExternalLink';

export function RepoCard({repo}: {repo: discover.Repository}) {
    return (
        <li className="repo-card">
            <img className="avatar" src={repo.ownerAvatarUrl} alt="" />
            <div className="repo-body">
                <ExternalLink href={repo.url} className="repo-name">
                    {repo.fullName}
                </ExternalLink>
                {repo.description && <p className="repo-desc">{repo.description}</p>}
                <div className="repo-meta">
                    {repo.language && <span className="repo-lang">{repo.language}</span>}
                    <span className="repo-stat">⭐ {repo.stars.toLocaleString()}</span>
                    <span className="repo-stat">🍴 {repo.forks.toLocaleString()}</span>
                </div>
            </div>
        </li>
    );
}
