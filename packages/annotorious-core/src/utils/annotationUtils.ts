import { v4 as uuidv4 } from 'uuid';
import type { Annotation, AnnotationBody, User } from '../model';

/**
 * Returns all users listed as creators or updaters in any parts of this
 * annotation.
 */
export const getContributors = (annotation: Annotation): User[] => {
  const { creator, updatedBy } = annotation.target;

  const bodyCollaborators = annotation.bodies.reduce((users, body) =>  (
    [...users, body.creator, body.updatedBy]
  ), [] as User[]);

  return [
    creator,
    updatedBy,
    ...bodyCollaborators
  ].filter(u => u); // Remove undefined
}

export const createBody = (
  annotation: Annotation, 
  payload: { value: string, [key: string]: any },
  created?: Date,
  creator?: User
): AnnotationBody => ({
  id: uuidv4(),
  annotation: annotation.id,
  created: created || new Date(),
  creator,
  ...payload
});