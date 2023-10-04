import { dequal } from 'dequal/lite';
import type { Annotation, FormatAdapter } from '../model';
import { Origin } from '../state';
import type { HoverState, SelectionState, Store, ViewportState } from '../state';
import type { LifecycleEvents } from './LifecycleEvents';

export type Lifecycle<I extends Annotation, E extends unknown> = 
  ReturnType<typeof createLifecyleObserver<I, E>>;

export const createLifecyleObserver = <I extends Annotation, E extends unknown>(
  store: Store<I>,
  selectionState: SelectionState<I>, 
  hoverState: HoverState<I>,
  viewportState?: ViewportState,
  adapter?: FormatAdapter<I, E>
) => {
  const observers = new Map<string, LifecycleEvents<E>[keyof LifecycleEvents<E>][]>();

  // The currently selected annotations, in the state when they were selected 
  let initialSelection: I[] = [];

  let currentHover: string | undefined;

  let idleTimeout: ReturnType<typeof setTimeout>;

  const on = <T extends keyof LifecycleEvents<E>>(event: T, callback: LifecycleEvents<E>[T]) => {
    if (observers.has(event)) {
      observers.get(event).push(callback);
    } else {
      observers.set(event, [callback]);
    }
  }

  const off = <T extends keyof LifecycleEvents<E>>(event: T, callback: LifecycleEvents<E>[T]) => {
    const callbacks = observers.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx > 0)
        callbacks.splice(callbacks.indexOf(callback), 1);
    }
  }

  const emit = (event: keyof LifecycleEvents<E>, arg0: I | I[], arg1: I = null) => {
    if (observers.has(event)) {
      setTimeout(() => {
        observers.get(event).forEach(callback => { 
          if (adapter) {
            const serialized0 = Array.isArray(arg0) ? 
              arg0.map(a => adapter.serialize(a)) : adapter.serialize(arg0);
            
            const serialized1 = arg1 && adapter.serialize(arg1);

            callback(serialized0 as E & E[], serialized1); 
          } else {
            callback(arg0 as E & E[], arg1 as unknown as E);  
          }
        });
      }, 1);
    }
  }

  const onIdleUpdate = () => {
    const { selected } = selectionState;

    // User idle after activity - fire update events for selected
    // annotations that changed
    const updatedSelected = selected.map(({ id }) => store.getAnnotation(id));

    updatedSelected.forEach(updated => {
      const initial = initialSelection.find(a => a.id === updated.id);
      if (!initial || !dequal(initial, updated)) {
        emit('updateAnnotation', updated, initial);
      }
    });

    initialSelection = initialSelection.map(initial => {
      const updated = updatedSelected.find(({ id }) => id === initial.id);
      return updated ? updated : initial
    });
  }

  selectionState.subscribe(({ selected })=> {
    if (initialSelection.length === 0 && selected.length === 0)
      return;

    if (initialSelection.length === 0 && selected.length > 0) {
      // A new selection was made - store the editable annotation as initial state
      initialSelection = selected.map(({ id }) => store.getAnnotation(id));
    } else if (initialSelection.length > 0 && selected.length === 0) {
      // Deselect!
      initialSelection.forEach(initial => {
        const updatedState = store.getAnnotation(initial.id);  
        
        if (updatedState && !dequal(updatedState, initial)) {
          emit('updateAnnotation', updatedState, initial);
        }
      });

      initialSelection = [];
    } else {
      // Changed selection
      const initialIds = new Set(initialSelection.map(a => a.id));
      const selectedIds = new Set(selected.map(({ id }) => id));

      // Fire update events for deselected annotations that have changed
      const deselected = initialSelection.filter(a => !selectedIds.has(a.id));
      deselected.forEach(initial => {
        const updatedState = store.getAnnotation(initial.id);

        if (updatedState && !dequal(updatedState, initial))
          emit('updateAnnotation', updatedState, initial);
      });

      initialSelection = [
        // Remove annotations that were deselected
        ...initialSelection.filter(a => selectedIds.has(a.id)),
        // Add editable annotations that were selected
        ...selected.filter(({ id }) => !initialIds.has(id))
          .map(({ id }) => store.getAnnotation(id))
      ];
    }

    emit('selectionChanged', initialSelection);
  });

  hoverState.subscribe(id => {
    if (!currentHover && id) {
      emit('mouseEnterAnnotation', store.getAnnotation(id));
    } else if (currentHover && !id) {
      emit('mouseLeaveAnnotation', store.getAnnotation(currentHover));
    } else if (currentHover && id) {
      emit('mouseLeaveAnnotation', store.getAnnotation(currentHover));
      emit('mouseEnterAnnotation', store.getAnnotation(id));
    }

    currentHover = id;
  });

  viewportState?.subscribe(ids => 
    emit('viewportIntersect', ids.map(store.getAnnotation)));

  store.observe(event => {
    // Idleness update trigger
    if (idleTimeout)
      clearTimeout(idleTimeout);

    idleTimeout = setTimeout(onIdleUpdate, 1000);

    // Local CREATE and DELETE events are applied immediately
    const { created, deleted } = event.changes;
    created.forEach(a => emit('createAnnotation', a));
    deleted.forEach(a => emit('deleteAnnotation', a));

    // Updates are only applied immediately if they involve body changes
    const updatesWithBody = event.changes.updated.filter(u => [
      ...(u.bodiesCreated || []),
      ...(u.bodiesDeleted || []),
      ...(u.bodiesUpdated || [])
    ].length > 0);

    // Emit an update with the new annototation and the stored initial state
    updatesWithBody.forEach(({ oldValue, newValue }) => {
      const initial = initialSelection.find(a => a.id === oldValue.id) || oldValue;

      // Record the update as the new last known state
      initialSelection = initialSelection
        .map(a => a.id === oldValue.id ? newValue : a);

      emit('updateAnnotation', newValue, initial);
    });
  }, { origin: Origin.LOCAL });

  // Track remote changes - these should update the initial state
  store.observe(event => {
    if (initialSelection) {
      const selectedIds = new Set(initialSelection.map(a => a.id));

      const relevantUpdates = event.changes.updated
        .filter(({ newValue }) => selectedIds.has(newValue.id))
        .map(({ newValue }) => newValue);

      if (relevantUpdates.length > 0) {
        initialSelection = initialSelection.map(selected => {
          const updated = relevantUpdates.find(updated => updated.id === selected.id);
          return updated ? updated : selected;
        })
      }
    }
  }, { origin: Origin.REMOTE });

  return { on, off, emit }

}