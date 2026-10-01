import type { WatchTitle } from "../domain/catalog/types";
import { Link, type Navigate } from "../components/Link";
import { MediaCard } from "../components/MediaCard";
import { findNenCollection, nenCollections } from "../data/nenCollections";

interface CollectionProps {
  slug?: string;
  titles: WatchTitle[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
}

const worksLabel = (count: number) => `${count} ${count === 1 ? "произведение" : count < 5 ? "произведения" : "произведений"}`;

export function CollectionsPage({ slug, titles, favorites, toggleFavorite, navigate }: CollectionProps) {
  if (!slug) return <div className="page">
    <p className="eyebrow">Редакционные подборки</p>
    <h1>Подборки</h1>
    <p className="lead">Готовые маршруты по каталогу для разных семейных планов и разговоров.</p>
    <div className="collection-row collection-index">
      {nenCollections.map((collection, index) => <Link key={collection.slug} href={`/collections/${collection.slug}`} navigate={navigate} className={`collection-tile tone-${index % 4}`}><span>{collection.title}</span><small>{worksLabel(collection.slugs.length)}</small></Link>)}
    </div>
  </div>;

  const collection = findNenCollection(slug);
  if (!collection) return <NotFoundPage navigate={navigate} />;
  const bySlug = new Map(titles.map((title) => [title.slug, title]));
  const selected = collection.slugs.map((itemSlug) => bySlug.get(itemSlug)).filter((title): title is WatchTitle => Boolean(title));

  return <div className="page">
    <p className="eyebrow">Редакционная подборка</p>
    <h1>{collection.title}</h1>
    <p className="lead">{collection.description}</p>
    <p className="collection-source-title">По материалу НЭН: «{collection.sourceTitle}»</p>
    <a className="nen-source-link" href={collection.sourceUrl} target="_blank" rel="noreferrer">Читать подборку на НЭН ↗</a>
    <div className="media-grid">{selected.map((title) => <MediaCard key={title.id} title={title} favorite={favorites.includes(title.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div>
    <Link href="/collections" navigate={navigate} className="secondary-link">Все подборки</Link>
  </div>;
}

export function RecommendPage({ navigate }: { navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Быстрый выбор</p><h1>Что будем смотреть?</h1><p>В каталогах можно уточнить выбор по возрасту ребёнка, настроению, темам, стране и формату произведения.</p><div className="button-row"><Link href="/cartoons" navigate={navigate} className="primary-link">Выбрать мультфильм</Link><Link href="/movies" navigate={navigate} className="secondary-link">Выбрать фильм</Link></div></div>;
}

export function NotFoundPage({ navigate }: { navigate: Navigate }) {
  return <div className="page narrow"><p className="eyebrow">Ошибка 404</p><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на главную.</p><Link href="/" navigate={navigate} className="primary-link">На главную</Link></div>;
}
