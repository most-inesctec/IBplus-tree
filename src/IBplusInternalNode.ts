import { IBplusNode, IBplusLeafNode, Interval, FlatInterval } from './internal';

export class IBplusInternalNode<T extends FlatInterval> extends IBplusNode<T> {

    constructor(order: number = 4,
        parent: IBplusInternalNode<T> = null,
        keys: Array<number> = [],
        maximums: Array<number> = [],
        private children: Array<IBplusNode<T>> = []) {
        super(order, parent, keys, maximums);

        for (const child of this.children)
            child.setParent(this);
    }

    getChildren(): Array<IBplusNode<T>> {
        return this.children;
    }

    setChildren(children: Array<IBplusNode<T>>): void {
        this.children = children;
    }

    private findRightSiblingAux(currentDepth: number, isAscending: boolean): IBplusNode<T> | null {
        if (isAscending) {
            // If is ascending set find a parent that has a right sibling
            let idxInParent: number = this.findIndexInParent();
            // No parent, so no right sibling
            if (idxInParent == null)
                return null;

            if (idxInParent < this.parent.getChildren().length - 1)
                return (<IBplusInternalNode<T>>this.parent.getChildren()[idxInParent + 1]).findRightSiblingAux(currentDepth, !isAscending);
            else
                return this.parent.findRightSiblingAux(currentDepth + 1, isAscending);
        } else {
            // If is descending find the right most node at the same depth
            if (currentDepth == 0)
                return this;
            else
                return (<IBplusInternalNode<T>>this.getChildren()[0]).findRightSiblingAux(currentDepth - 1, isAscending);
        }
    }

    findRightSibling(): IBplusNode<T> | null {
        let test = this.findRightSiblingAux(0, true);

        if (test != null && test.findLeftSibling() != this) {
            console.log("GGGGG")
            this.findRightSiblingAux(0, true);
        }

        return test;
    }

    protected concatSiblings() {
        // Template method - Do nothing as this node has no sibling pointers
    }

    /**
     * Updates the current node structures, when a new maximum appears in a child node.
     * 
     * @param node the child
     */
    updateMax(node: IBplusNode<T>): void {
        let newMax: number = node.getMax();
        let prevMax: number = this.getMax();

        this.maximums[this.children.indexOf(node)] = newMax;

        if (!this.isRoot() && (newMax > prevMax || this.getMax() != prevMax))
            this.parent.updateMax(this);
    }

    /**
     * Updates the current node structures, when a new minimum key appears in a child node.
     * 
     * @param node the child
     */
    updateMin(node: IBplusNode<T>): void {
        let newMin: number = node.getMinKey();
        let prevMin: number = this.getMinKey();
        let index: number = this.children.indexOf(node);

        this.keys[index] = newMin;

        if (!this.isRoot() && (newMin < prevMin || index == 0))
            this.parent.updateMin(this);
    }

    exists(int: T): boolean {
        for (let i: number = 0; i < this.keys.length; ++i)
            if ((new FlatInterval(this.keys[i], this.maximums[i])).contains(int))
                if (this.children[i].exists(int))
                    return true;

        return false;
    }

    search(int: FlatInterval): Set<T> {
        const intervals: Set<T> = new Set();

        for (let i = 0; i < this.keys.length; ++i)
            if (Interval.containsWithValues(
                [this.keys[i], this.maximums[i]], [int.getLowerBound(), int.getUpperBound()])) {
                const iterator = this.children[i].search(int).values();

                for (let next = iterator.next(); next.done !== true; next = iterator.next())
                    intervals.add(next.value);
            }

        return intervals;
    }

    loneRangeSearch(int: FlatInterval) {
        for (let i: number = 0; i < this.keys.length; ++i)
            if (Interval.intersectsWithValues(
                [int.getLowerBound(), int.getUpperBound()], [this.keys[i], this.maximums[i]]))
                return this.children[i].loneRangeSearch(int)

        return null;
    }

    allRangeSearch(int: FlatInterval) {
        const intervals: Set<T> = new Set();

        for (let i = 0; i < this.keys.length; ++i)
            if (Interval.intersectsWithValues(
                [int.getLowerBound(), int.getUpperBound()], [this.keys[i], this.maximums[i]])) {
                const iterator = this.children[i].allRangeSearch(int).values();

                for (let next = iterator.next(); next.done !== true; next = iterator.next())
                    intervals.add(next.value);
            }

        return intervals;
    }

    containedRangeSearch(int: FlatInterval) {
        const intervals: Set<T> = new Set();

        for (let i = 0; i < this.keys.length; ++i)
            if (Interval.intersectsWithValues(
                [int.getLowerBound(), int.getUpperBound()], [this.keys[i], this.maximums[i]])) {
                const iterator = this.children[i].containedRangeSearch(int).values();

                for (let next = iterator.next(); next.done !== true; next = iterator.next())
                    intervals.add(next.value);
            }

        return intervals;
    }

    findInsertNode(int: Interval<T>): IBplusLeafNode<T> | null {
        if (this.children.length == 0)
            return null;

        for (let i = 0; i < this.keys.length; ++i)
            if (int.getLowerBound() < this.keys[i])
                return this.children[i > 0 ? i - 1 : i].findInsertNode(int);

        return this.children[this.keys.length - 1].findInsertNode(int); // The biggest
    }

    /**
     * When a split occurred in a child of this node, the node structures must be updated.
     * Updates maximum and key of previous node and adds the newly created node to this node children.
     * 
     * @param original The node that was split
     * @param newNode The node that was created
     */
    updateWithNewNode(original: IBplusNode<T>, newNode: IBplusNode<T>): void {
        let originalIdx: number = this.children.indexOf(original);
        this.maximums[originalIdx] = original.getMax();

        this.children.splice(originalIdx + 1, 0, newNode);
        this.keys.splice(originalIdx + 1, 0, newNode.getMinKey());
        this.maximums.splice(originalIdx + 1, 0, newNode.getMax());

        // if (!this.isRoot()) // Not sure if needed
        //     this.updateParentValues();

        // Might be momentarily violating B+-trees order invariant
        if (this.keys.length > this.order)
            this.split();
    }

    split(): IBplusLeafNode<T> {
        // If this is root, create a new root
        if (this.parent == null)
            this.parent = new IBplusInternalNode(
                this.order,
                null,
                [this.getMinKey()],
                [this.getMax()],
                [this]
            );

        let divIdx: number = Math.ceil(this.keys.length / 2)
        let sibSize: number = this.order + 1 - divIdx; //Need +1 because of the invariant violation

        // Divide keys, maximums and children by this node and its sibling
        let sibling: IBplusInternalNode<T> = new IBplusInternalNode<T>(
            this.order,
            this.parent,
            this.keys.splice(divIdx, sibSize),
            this.maximums.splice(divIdx, sibSize),
            this.children.splice(divIdx, sibSize)
        );

        this.parent.updateWithNewNode(this, sibling);

        // When called in IBplusInternalNode, the split method is not handling direct insertions
        // hence, its return value is irrelevant
        return null;
    }

    findInterval(int: Interval<T>): [IBplusLeafNode<T>, number] | null {
        let res: [IBplusLeafNode<T>, number] = null;

        for (let i = 0; i < this.keys.length && res == null; ++i)
            if (Interval.containsWithValues(
                [this.keys[i], this.maximums[i]], [int.getLowerBound(), int.getUpperBound()]))
                res = this.children[i].findInterval(int);

        return res;
    }

    findIntervalsInRange(int: Interval<T> | FlatInterval): Array<[IBplusLeafNode<T>, Interval<T>]> {
        let res: Array<[IBplusLeafNode<T>, Interval<T>]> = [];

        for (let i = 0; i < this.keys.length; ++i)
            if (Interval.intersectsWithValues(
                [this.keys[i], this.maximums[i]], [int.getLowerBound(), int.getUpperBound()]))
                res.push(...this.children[i].findIntervalsInRange(int));

        return res;
    }

    /**
     * Deletes a given interval if it exists in one of the tree's (that have this node as root) leafs.
     * The tree self-balances on deletion.
     * 
     * @param int The interval to be deleted
     */
    delete(int: Interval<T>): void {
        let found: [IBplusLeafNode<T>, number] = this.findInterval(int);

        if (found != null)
            found[0].removeChild(found[1]);
    }

    /**
     * Deletes all the interval contained in a given range.
     * The tree self-balances on deletion.
     * 
     * @param lowerBound the range's lower bound
     * @param upperBound the range's upper bound
     */
    rangeDelete(lowerBound: number, upperBound: number): void {
        let foundInts: Array<[IBplusLeafNode<T>, Interval<T>]> =
            this.findIntervalsInRange(
                new FlatInterval(lowerBound, upperBound)
            );

        for (let [leaf, int] of foundInts) {
            // Recursively get the leaf currently substituting this leaf
            leaf = leaf.getSubstituteSibling();

            let childIdx: number = -1;
            for (let i = 0; i < leaf.getChildren().length; ++i)
                if (int.equals(leaf.getChildren()[i]))
                    childIdx = i;

            if (childIdx < 0) {
                let leftSibling: IBplusNode<T> = leaf.findLeftSibling();
                let rightSibling: IBplusNode<T> = leaf.findRightSibling();

                if ((leftSibling != null && (<IBplusLeafNode<T>>leftSibling).substSibling != null) ||
                    (leftSibling != null && (<IBplusLeafNode<T>>leftSibling).substSibling != null))
                    console.log("MOTHERFUCKER")

                // Previous removals triggered borrows that moved the child
                if (leftSibling && int.getLowerBound() <= leaf.getMinKey())
                    // Sent to left sibling leaf
                    leaf = <IBplusLeafNode<T>>leftSibling;
                else if (rightSibling && int.getLowerBound() > leaf.getMinKey())
                    // Sent to right sibling leaf
                    leaf = <IBplusLeafNode<T>>rightSibling;
                else
                    throw Error('Unable to find child in range remove.');

                // Finding index of children in sibling child
                for (let i = 0; i < leaf.getChildren().length; ++i)
                    if (int.equals(leaf.getChildren()[i]))
                        childIdx = i;
            }

            leaf.removeChild(childIdx);
        }
    }

    protected setChildParentOnBorrow(newChild: IBplusNode<T>, insertId: number): void {
        this.children.splice(insertId, 0, newChild);
        newChild.setParent(this);

        if (newChild.findRightSibling().getMinKey() < newChild.keys[newChild.getChildren().length - 1])
            console.log("XAUSS")
    }

    protected setChildrenParentOnMerge(newParent: IBplusInternalNode<T>): void {
        for (const child of this.children)
            child.setParent(newParent);
    }

    protected setSubstitutionNode(node: IBplusNode<T>): void {
        // No interest in saving substitution node in Internal Nodes
    }

    isChildNewRoot(): boolean {
        if (!this.isRoot() || this.children.length > 1)
            return false;

        return this.children[0] instanceof IBplusInternalNode &&
            this.children[0].findLeftSibling() == null &&
            this.children[0].findRightSibling() == null;
    }


    asString(acc: string = "", depth: number = 0): string {
        // Adding tabs according to depth
        let tabs: string = "";
        for (let i: number = 0; i < depth; ++i)
            tabs += '\t';

        acc += `${tabs}- Keys |`;
        for (let key of this.keys)
            acc += `${key}|`;

        acc += `\n${tabs}  Maxs |`;
        for (let max of this.maximums)
            acc += `${max}|`;
        acc += "\n";

        for (let child of this.children)
            acc = child.asString(acc, depth + 1);

        return acc;
    }
}