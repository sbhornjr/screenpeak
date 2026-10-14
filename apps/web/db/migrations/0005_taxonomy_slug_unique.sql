-- Unique taxonomy slugs. One statement so a duplicate aborts before any constraint is added.
-- Existing rows are not renamed. Reconcile duplicates, then run this again.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.genres GROUP BY slug HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'genres slug duplicates must be reconciled before uniqueness';
    END IF;
    IF EXISTS (SELECT 1 FROM public.platforms GROUP BY slug HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'platforms slug duplicates must be reconciled before uniqueness';
    END IF;
    IF EXISTS (SELECT 1 FROM public.developers GROUP BY slug HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'developers slug duplicates must be reconciled before uniqueness';
    END IF;
    IF EXISTS (SELECT 1 FROM public.publishers GROUP BY slug HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'publishers slug duplicates must be reconciled before uniqueness';
    END IF;
    EXECUTE 'ALTER TABLE public.genres ADD CONSTRAINT genres_slug_key UNIQUE (slug)';
    EXECUTE 'ALTER TABLE public.platforms ADD CONSTRAINT platforms_slug_key UNIQUE (slug)';
    EXECUTE 'ALTER TABLE public.developers ADD CONSTRAINT developers_slug_key UNIQUE (slug)';
    EXECUTE 'ALTER TABLE public.publishers ADD CONSTRAINT publishers_slug_key UNIQUE (slug)';
END $$;
