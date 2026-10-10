import type { WatchTitle } from "../domain/catalog/types";
import { Link, type Navigate } from "../components/Link";
import { MediaCard } from "../components/MediaCard";
import { featuredNenCollections } from "../data/nenCollections";

export const homeQuickActions = [
  { href: "/cartoons", label: "Выбрать мультфильм", description: "Полный метр и короткие работы", className: "cartoons", icon: "✦" },
  { href: "/animated-series", label: "Выбрать мультсериал", description: "Эпизоды и сезоны", className: "animated-series", icon: "✺" },
  { href: "/movies", label: "Выбрать фильм", description: "Смотреть вместе и обсуждать", className: "movies", icon: "▶" },
  { href: "/series", label: "Выбрать сериал", description: "Игровые и познавательные", className: "series", icon: "▤" },
] as const;

export function HomePage({ titles, favorites, toggleFavorite, navigate }: { titles: WatchTitle[]; favorites: string[]; toggleFavorite: (id: string) => void; navigate: Navigate }) {
  return <div className="page home-page">
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-brand"><img src="/nen-logo.png" alt="" /><span>киносервис</span></div>
        <p className="eyebrow">Семейный просмотр без бесконечного поиска</p>
        <h1>Что посмотреть?</h1>
        <p className="lead">Подберите фильм, мультфильм или сериал по возрасту, интересам и настроению ребёнка — и найдите темы для разговора после просмотра.</p>
        <div className="hero-actions"><Link href="/cartoons" navigate={navigate} className="primary-link">Открыть каталог</Link><Link href="/recommend" navigate={navigate} className="secondary-link">Помочь с выбором</Link></div>
      </div>
      <figure className="brand-illustration hero-illustration"><img src="/illustrations/cinema-projector-child.jpg" alt="Ребёнок показывает фильм на проекторе" width="1336" height="760" fetchPriority="high" /></figure>
    </section>
    <section className="quick-choice-section" aria-labelledby="quick-choice-title">
      <div className="quick-choice-intro">
        <div><p className="eyebrow">Быстрый выбор</p><h2 id="quick-choice-title">С чего начнём?</h2><p>Выберите формат — уточнить возраст, настроение и тему можно уже в каталоге.</p></div>
        <figure className="brand-illustration quick-choice-illustration"><img src="/illustrations/family-tv.jpg" alt="Семья выбирает фильм перед телевизором" width="1336" height="760" loading="lazy" /></figure>
      </div>
      <div className="entry-grid" aria-label="Быстрый выбор формата">
        {homeQuickActions.map((action) => <Link key={action.href} href={action.href} navigate={navigate} className={`entry-card ${action.className}`}><span>{action.icon}</span><strong>{action.label}</strong><small>{action.description}</small></Link>)}
      </div>
    </section>
    <section className="recommend-callout"><div><p className="eyebrow">Быстрый путь</p><h2>Не знаете, что выбрать?</h2><p>Начните с формата, а затем уточните выбор по возрасту, настроению и темам.</p></div><Link href="/recommend" navigate={navigate} className="primary-link">Подобрать произведение →</Link></section>
    <section className="editorial-section"><div className="editorial-intro"><div><p className="eyebrow">Выбор редакции НЭН</p><h2>Подборки для семейного просмотра</h2><p>Готовые списки к семейному вечеру — с контекстом и ссылками на публикации НЭН.</p><Link href="/collections" navigate={navigate} className="text-link">Все подборки →</Link></div><figure className="brand-illustration editorial-illustration"><img src="/illustrations/family-armchairs.jpg" alt="Семья смотрит фильм в креслах" width="1336" height="760" loading="lazy" /></figure></div><div className="collection-row">{featuredNenCollections.map((collection, index) => <Link key={collection.slug} href={`/collections/${collection.slug}`} navigate={navigate} className={`collection-tile tone-${index}`}><span>{collection.title}</span><small>{collection.slugs.length} произведений</small></Link>)}</div></section>
    <section><div className="section-heading"><div><p className="eyebrow">С чего начать</p><h2>Выбор редакции</h2></div></div><div className="media-grid">{titles.slice(0, 3).map((title) => <MediaCard key={title.id} title={title} favorite={favorites.includes(title.id)} toggleFavorite={toggleFavorite} navigate={navigate} />)}</div></section>
  </div>;
}
